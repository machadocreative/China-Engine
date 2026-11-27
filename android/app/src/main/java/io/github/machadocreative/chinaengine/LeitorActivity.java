package io.github.machadocreative.chinaengine;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Tela do Leitor de Pix (2.19.0). Abre pelo China Engine (Sistema → Leitor de Pix) com o link
 * chinaengine://leitor?u=<Worker>&c=<código>. Conecta o leitor e mostra, passo a passo, as liberações
 * que o Android pede: acesso às notificações, configurações restritas (APK instalado fora da loja),
 * bateria sem restrições e inicialização automática (Xiaomi/Poco).
 */
public class LeitorActivity extends Activity {

    private static final int PRETO = 0xFF1A1A17, AMARELO = 0xFFF7C600, VERDE = 0xFF2E7D32,
            VERMELHO = 0xFFE0241B, CINZA = 0xFF6B6A63, FUNDO = 0xFFF4F2EC;

    private LinearLayout raiz;
    private EditText campoUrl, campoCodigo, campoNome;
    private String urlRecebida = "", codigoRecebido = "";
    private boolean ocupado = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        lerLink(getIntent());
        if (!codigoRecebido.isEmpty()) conectarAgora();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        lerLink(intent);
        if (!codigoRecebido.isEmpty()) conectarAgora();
        else montar();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // se o Android desligou o leitor (economia de bateria), pede para ligar de novo
        if (Build.VERSION.SDK_INT >= 24 && acessoLiberado()) {
            try { NotificationListenerService.requestRebind(new ComponentName(this, LeitorNotificacoes.class)); }
            catch (Exception ignorado) { }
        }
        PixEnvio.processarFila(this);
        montar();
    }

    private void lerLink(Intent i) {
        Uri u = i == null ? null : i.getData();
        if (u == null) return;
        String url = u.getQueryParameter("u"), cod = u.getQueryParameter("c");
        if (url != null && url.startsWith("https://")) urlRecebida = url;
        if (cod != null && cod.matches("\\d{6}")) codigoRecebido = cod;
    }

    // ----- tela -----
    private void montar() {
        ScrollView rolagem = new ScrollView(this);
        rolagem.setBackgroundColor(FUNDO);
        raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        int m = dp(18);
        raiz.setPadding(m, dp(22), m, dp(28));
        rolagem.addView(raiz);
        setContentView(rolagem);

        texto("Leitor de Pix", 26, PRETO, true);
        texto("Lê os avisos de Pix do banco neste celular e avisa os outros aparelhos da loja. "
                + "Só o valor, a hora e o banco saem daqui: o nome de quem pagou nunca é guardado.", 16, CINZA, false);

        SharedPreferences p = PixEnvio.prefs(this);
        boolean conectado = PixEnvio.conectado(this);
        String sit = p.getString("situacao", "");

        // 1. Conexão
        titulo("1. Conexão com a loja");
        if (conectado && !"removido".equals(sit) && !"chave".equals(sit)) {
            estado(true, "Conectado como “" + p.getString("nome", "Leitor de Pix") + "”.");
            botao("Enviar um teste", false, v -> testar());
            botao("Desconectar este leitor", false, v -> {
                PixEnvio.desconectar(this);
                Toast.makeText(this, "Leitor desconectado.", Toast.LENGTH_SHORT).show();
                montar();
            });
        } else {
            if ("removido".equals(sit)) estado(false, "Este leitor foi removido em Aparelhos conectados. Conecte de novo com um código novo.");
            else if ("chave".equals(sit)) estado(false, "A chave deste leitor não vale mais. Conecte de novo com um código novo.");
            else estado(false, "Ainda não conectado. No China Engine deste celular, toque em Sistema → Leitor de Pix → “Ligar o leitor de Pix neste celular”. Ou digite abaixo o código gerado em Aparelhos conectados (nível Leitor de Pix).");
            campoUrl = campo("Endereço do Worker", urlRecebida.isEmpty() ? p.getString("url", "") : urlRecebida, InputType.TYPE_TEXT_VARIATION_URI);
            campoCodigo = campo("Código (6 números)", codigoRecebido, InputType.TYPE_CLASS_NUMBER);
            campoNome = campo("Nome deste leitor", p.getString("nome", "Leitor de Pix · " + Build.MODEL), InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
            botao("Conectar", true, v -> conectarDosCampos());
        }

        // 2. Acesso às notificações
        titulo("2. Acesso às notificações");
        boolean acesso = acessoLiberado();
        estado(acesso, acesso ? "Liberado: o leitor está recebendo os avisos."
                : "Ainda não liberado. Toque abaixo e ligue o “China Engine” na lista.");
        botao("Abrir o acesso às notificações", !acesso, v -> abrir(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")));
        if (!acesso) {
            texto("Se o Android disser que é uma “configuração restrita” (acontece porque o app foi instalado fora da loja): "
                    + "abra as informações do app, toque no menu ⋮ no canto de cima e em “Permitir configurações restritas”. "
                    + "Depois volte e ligue o acesso de novo.", 15, CINZA, false);
            botao("Abrir as informações do app", false, v -> abrirInfoApp());
        }

        // 3. Bateria
        titulo("3. Bateria sem restrições");
        boolean bateria = bateriaLivre();
        estado(bateria, bateria ? "Sem restrições: o Android não desliga o leitor."
                : "O Android pode desligar o leitor para economizar bateria.");
        if (!bateria) botao("Liberar a bateria", true, v -> pedirBateria());

        // 4. Xiaomi / Poco
        if (Build.MANUFACTURER != null && Build.MANUFACTURER.toLowerCase().matches(".*(xiaomi|poco|redmi).*")) {
            titulo("4. Inicialização automática (Xiaomi/Poco)");
            texto("No HyperOS, ligue também a “Inicialização automática” do China Engine. "
                    + "Sem isso, o leitor para quando o celular fica muito tempo sem uso.", 15, CINZA, false);
            botao("Abrir a inicialização automática", false, v -> abrirAutostart());
        }

        // Situação
        titulo("Último Pix lido");
        String ultimo = p.getString("ultimo", "");
        texto(ultimo.isEmpty() ? "Nenhum ainda." : ultimo, 16, PRETO, false);
        int pend = 0;
        try { pend = new org.json.JSONArray(p.getString("fila", "[]")).length(); } catch (Exception ignorado) { }
        if (pend > 0) texto(pend + " aviso(s) aguardando internet para sair.", 15, VERMELHO, false);

        botao("Voltar ao China Engine", false, v -> voltar());
    }

    // ----- ações -----
    private void conectarAgora() {
        String url = urlRecebida.isEmpty() ? PixEnvio.prefs(this).getString("url", "") : urlRecebida;
        String nome = PixEnvio.prefs(this).getString("nome", "Leitor de Pix · " + Build.MODEL);
        String cod = codigoRecebido;
        codigoRecebido = "";
        montar();
        if (url.isEmpty()) return;
        conectar(url, cod, nome);
    }

    private void conectarDosCampos() {
        String url = campoUrl.getText().toString().trim().replaceAll("/+$", "");
        String cod = campoCodigo.getText().toString().replaceAll("\\D", "");
        String nome = campoNome.getText().toString().trim();
        if (!url.startsWith("https://")) { aviso("Informe o endereço do Worker (começa com https://)."); return; }
        if (cod.length() != 6) { aviso("O código tem 6 números."); return; }
        if (nome.isEmpty()) nome = "Leitor de Pix · " + Build.MODEL;
        conectar(url, cod, nome);
    }

    private void conectar(String url, String cod, String nome) {
        if (ocupado) return;
        ocupado = true;
        aviso("Conectando…");
        PixEnvio.conectar(this, url, cod, nome, (st, msg) -> runOnUiThread(() -> {
            ocupado = false;
            if (st >= 200 && st < 300) {
                aviso("Leitor conectado. Agora libere o acesso às notificações.");
                urlRecebida = url;
            } else aviso(msg != null ? msg : "Não foi possível conectar.");
            montar();
        }));
    }

    private void testar() {
        PixEnvio.testar(this, (st, msg) -> runOnUiThread(() -> {
            if (st >= 200 && st < 300) aviso("Teste enviado: o Worker respondeu. Aparece no Log de alterações.");
            else if (st == 401 || st == 403) aviso("O Worker recusou a chave deste leitor. Conecte de novo com um código novo.");
            else aviso("Sem resposta do Worker. Confira a internet.");
        }));
    }

    private boolean acessoLiberado() {
        String lista = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return lista != null && lista.contains(getPackageName());
    }

    private boolean bateriaLivre() {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void pedirBateria() {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception e) {
            abrirInfoApp();
        }
    }

    private void abrirAutostart() {
        try {
            Intent i = new Intent();
            i.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
            startActivity(i);
        } catch (Exception e) {
            abrirInfoApp();
        }
    }

    private void abrirInfoApp() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.parse("package:" + getPackageName()));
        abrir(i);
    }

    private void abrir(Intent i) {
        try { startActivity(i); }
        catch (ActivityNotFoundException e) { aviso("Este celular não tem essa tela. Procure nas Configurações do Android."); }
    }

    private void voltar() {
        if (isTaskRoot()) {
            Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (i != null) startActivity(i);
        }
        finish();
    }

    private void aviso(String t) { Toast.makeText(this, t, Toast.LENGTH_LONG).show(); }

    // ----- pecinhas da tela (sem bibliotecas: fonte mínima de 15sp) -----
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private TextView texto(String t, int sp, int cor, boolean negrito) {
        TextView tv = new TextView(this);
        tv.setText(t);
        tv.setTextSize(sp);
        tv.setTextColor(cor);
        if (negrito) tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setLineSpacing(0, 1.15f);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(10);
        raiz.addView(tv, lp);
        return tv;
    }

    private void titulo(String t) {
        TextView tv = texto(t, 19, PRETO, true);
        ((LinearLayout.LayoutParams) tv.getLayoutParams()).topMargin = dp(18);
    }

    private void estado(boolean ok, String t) {
        TextView tv = texto((ok ? "✓ " : "• ") + t, 16, ok ? VERDE : PRETO, ok);
        GradientDrawable g = new GradientDrawable();
        g.setColor(ok ? 0xFFE5F2E6 : 0xFFFFF6CC);
        g.setCornerRadius(dp(12));
        tv.setBackground(g);
        tv.setPadding(dp(12), dp(10), dp(12), dp(10));
    }

    private EditText campo(String rotulo, String valor, int tipo) {
        texto(rotulo, 15, PRETO, true);
        EditText e = new EditText(this);
        e.setText(valor);
        e.setTextSize(17);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_TEXT | tipo);
        if (tipo == InputType.TYPE_CLASS_NUMBER) e.setInputType(InputType.TYPE_CLASS_NUMBER);
        e.setBackgroundColor(Color.WHITE);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(12);
        raiz.addView(e, lp);
        return e;
    }

    private void botao(String t, boolean principal, View.OnClickListener acao) {
        Button bt = new Button(this);
        bt.setText(t);
        bt.setAllCaps(false);
        bt.setTextSize(16);
        bt.setTypeface(Typeface.DEFAULT_BOLD);
        bt.setTextColor(PRETO);
        GradientDrawable g = new GradientDrawable();
        g.setColor(principal ? AMARELO : Color.WHITE);
        g.setStroke(dp(principal ? 2 : 1), principal ? PRETO : 0xFFB8B5AA);
        g.setCornerRadius(dp(14));
        bt.setBackground(g);
        bt.setGravity(Gravity.CENTER);
        bt.setOnClickListener(acao);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52));
        lp.bottomMargin = dp(10);
        raiz.addView(bt, lp);
    }
}
