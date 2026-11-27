package io.github.machadocreative.chinaengine;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Leitor de Pix (2.19.0): entende o aviso do banco e avisa o Worker da sincronização.
 *
 * Guarda (só neste celular, nas preferências do app): o endereço do Worker, a chave do leitor
 * (recebida ao conectar com o código de 6 números, nível "Leitor de Pix") e uma fila do que ainda
 * não saiu (sem internet, por exemplo). Do aviso, só saem o valor, a hora e o banco:
 * o nome de quem pagou nunca é guardado nem enviado.
 */
final class PixEnvio {

    static final String PREFS = "leitor_pix";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    // "R$0,50", "R$ 1.250,00", "R$1250,00"
    private static final Pattern VALOR = Pattern.compile("R\\$\\s*([0-9][0-9.]*,[0-9]{2})");

    /** Um Pix lido de um aviso. */
    static final class Pix {
        final double valor;
        final String origem;
        Pix(double valor, String origem) { this.valor = valor; this.origem = origem; }
    }

    private PixEnvio() { }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean conectado(Context c) {
        SharedPreferences p = prefs(c);
        return !p.getString("url", "").isEmpty() && !p.getString("chave", "").isEmpty();
    }

    static String aparelhoId(Context c) {
        SharedPreferences p = prefs(c);
        String id = p.getString("aparelhoId", "");
        if (id.isEmpty()) {
            id = "lp" + UUID.randomUUID().toString().replace("-", "");
            p.edit().putString("aparelhoId", id).apply();
        }
        return id;
    }

    private static String normal(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(Locale.ROOT);
    }

    /**
     * Lê o aviso. Devolve null quando não é um Pix recebido de um banco conhecido.
     * Nesta versão: só a CAIXA (título "Pix CAIXA"; texto "Pix recebido com sucesso … no valor de R$ …").
     * Mensagens de conversa (WhatsApp, SMS…) nunca contam, mesmo que falem de Pix.
     */
    static Pix interpretar(String pacote, String titulo, String texto) {
        String t = normal(titulo), x = normal(texto), pac = normal(pacote);
        if (texto == null || pac.matches(".*(whatsapp|telegram|messag|mms|sms|instagram|facebook|orca|signal|discord|gmail|mail).*")) return null;
        boolean caixa = t.contains("caixa") || pac.contains("caixa");
        if (!caixa) return null;
        boolean recebido = x.contains("pix recebido") || (x.contains("pix") && (x.contains("recebeu") || x.contains("recebido")));
        if (!recebido) return null;
        Matcher m = VALOR.matcher(texto);
        if (!m.find()) return null;
        double valor;
        try {
            valor = Double.parseDouble(m.group(1).replace(".", "").replace(",", "."));
        } catch (NumberFormatException e) {
            return null;
        }
        if (valor <= 0) return null;
        String origem;
        if (t.contains("caixa") || normal(pacote).contains("caixa")) origem = "Pix CAIXA";
        else origem = (titulo == null || titulo.trim().isEmpty()) ? "Pix" : titulo.trim();
        if (origem.length() > 40) origem = origem.substring(0, 40);
        return new Pix(valor, origem);
    }

    /** Coloca o Pix na fila (sem repetir o mesmo aviso) e tenta enviar. */
    static void registrar(Context c, Pix pix, String pacote, long quandoMs) {
        Context ctx = c.getApplicationContext();
        long centavos = Math.round(pix.valor * 100);
        String chave = pacote + "|" + quandoMs + "|" + centavos;
        String id = UUID.nameUUIDFromBytes(chave.getBytes(StandardCharsets.UTF_8)).toString().replace("-", "");
        SharedPreferences p = prefs(ctx);
        Set<String> vistos = new HashSet<>(p.getStringSet("vistos", new HashSet<>()));
        if (vistos.contains(id)) return;            // o banco atualizou o mesmo aviso
        if (vistos.size() > 200) vistos.clear();
        vistos.add(id);
        String quando = iso(quandoMs);
        String ultimo = String.format(Locale.forLanguageTag("pt-BR"), "R$ %.2f às %s", pix.valor,
                new SimpleDateFormat("HH:mm", Locale.US).format(new Date(quandoMs)));
        try {
            JSONArray fila = new JSONArray(p.getString("fila", "[]"));
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("valor", pix.valor);
            o.put("origem", pix.origem);
            o.put("quando", quando);
            o.put("pacote", pacote);
            fila.put(o);
            while (fila.length() > 50) fila.remove(0);
            p.edit().putStringSet("vistos", vistos).putString("fila", fila.toString())
                    .putString("ultimo", ultimo + " (" + pix.origem + ")").apply();
        } catch (Exception e) {
            return;
        }
        processarFila(ctx);
    }

    /** Envia o que estiver na fila. Sem internet: fica para a próxima vez. */
    static void processarFila(Context c) {
        Context ctx = c.getApplicationContext();
        EXECUTOR.execute(() -> {
            SharedPreferences p = prefs(ctx);
            if (!conectado(ctx)) return;
            try {
                JSONArray fila = new JSONArray(p.getString("fila", "[]"));
                JSONArray restam = new JSONArray();
                for (int i = 0; i < fila.length(); i++) {
                    JSONObject o = fila.getJSONObject(i);
                    int st = post(ctx, "/pix", o.toString());
                    if (st >= 200 && st < 300) {
                        p.edit().putString("situacao", "ok").putLong("enviadoEm", System.currentTimeMillis()).apply();
                    } else if (st == 401 || st == 403) {
                        p.edit().putString("situacao", st == 403 ? "removido" : "chave").apply();
                        for (int j = i; j < fila.length(); j++) restam.put(fila.get(j));
                        break;
                    } else {
                        restam.put(o);                     // sem internet ou erro do servidor: tenta de novo depois
                    }
                }
                p.edit().putString("fila", restam.toString()).apply();
            } catch (Exception e) {
                // fila corrompida: recomeça
                p.edit().putString("fila", "[]").apply();
            }
        });
    }

    /** Envio de teste: confere se o leitor está conectado ao Worker. Responde na thread de envio. */
    static void testar(Context c, Resposta r) {
        Context ctx = c.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                JSONObject o = new JSONObject();
                o.put("teste", true);
                o.put("origem", "Teste do leitor");
                r.pronto(post(ctx, "/pix", o.toString()), null);
            } catch (Exception e) {
                r.pronto(-1, e.getMessage());
            }
        });
    }

    /** Troca o código de 6 números pela chave do leitor (nível "Leitor de Pix"). */
    static void conectar(Context c, String url, String codigo, String nome, Resposta r) {
        Context ctx = c.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                JSONObject o = new JSONObject();
                o.put("codigo", codigo);
                o.put("nome", nome);
                o.put("aparelhoId", aparelhoId(ctx));
                String[] resp = new String[1];
                int st = requisicao(url + "/pareamento/usar", null, o.toString(), resp);
                JSONObject j = resp[0] == null || resp[0].isEmpty() ? new JSONObject() : new JSONObject(resp[0]);
                if (st >= 200 && st < 300 && j.optString("chave").startsWith("ce_")) {
                    if (!"leitor".equals(j.optString("nivel"))) {
                        r.pronto(-2, "Este código não é de Leitor de Pix. No China Engine, use “Ligar o leitor de Pix neste celular” ou gere um código de nível Leitor de Pix.");
                        return;
                    }
                    prefs(ctx).edit().putString("url", url).putString("chave", j.getString("chave"))
                            .putString("nome", nome).putString("situacao", "ok").apply();
                    processarFila(ctx);
                    r.pronto(st, null);
                } else {
                    r.pronto(st, j.optString("mensagem", "O Worker respondeu com erro (" + st + ")."));
                }
            } catch (Exception e) {
                r.pronto(-1, "Não foi possível falar com o Worker. Confira o endereço e a internet.");
            }
        });
    }

    static void desconectar(Context c) {
        prefs(c).edit().remove("chave").remove("situacao").putString("fila", "[]").apply();
    }

    interface Resposta {
        void pronto(int status, String mensagem);
    }

    private static int post(Context ctx, String caminho, String corpo) {
        SharedPreferences p = prefs(ctx);
        try {
            String q = "?ap=" + URLEncoder.encode(aparelhoId(ctx), "UTF-8")
                    + "&apn=" + URLEncoder.encode(p.getString("nome", "Leitor de Pix"), "UTF-8");
            return requisicao(p.getString("url", "") + caminho + q, p.getString("chave", ""), corpo, null);
        } catch (Exception e) {
            return -1;
        }
    }

    private static int requisicao(String endereco, String chave, String corpo, String[] resposta) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(endereco).openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(15000);
            con.setReadTimeout(20000);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            if (chave != null) con.setRequestProperty("Authorization", "Bearer " + chave);
            byte[] dados = corpo.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = con.getOutputStream()) { os.write(dados); }
            int st = con.getResponseCode();
            if (resposta != null) {
                InputStream in = st >= 400 ? con.getErrorStream() : con.getInputStream();
                resposta[0] = in == null ? "" : ler(in);
            }
            return st;
        } catch (Exception e) {
            return -1;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String ler(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }
}
