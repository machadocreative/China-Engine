package io.github.machadocreative.chinaengine;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Leitor de notificações de Pix (2.19.0).
 *
 * O Android avisa este serviço a cada notificação nova. Só interessa o aviso "Pix recebido"
 * do banco (hoje: Pix CAIXA); todo o resto é ignorado na hora, sem guardar nada.
 * Para funcionar, o usuário libera o "Acesso a notificações" do China Engine
 * (o passo a passo fica na tela do leitor, LeitorActivity).
 */
public class LeitorNotificacoes extends NotificationListenerService {

    @Override
    public void onListenerConnected() {
        PixEnvio.prefs(this).edit().putLong("ligadoEm", System.currentTimeMillis()).apply();
        PixEnvio.processarFila(this);       // envia o que ficou para trás (sem internet, por exemplo)
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !PixEnvio.conectado(this)) return;
        String pacote = sbn.getPackageName();
        if (pacote == null || pacote.equals(getPackageName()) || pacote.startsWith("com.android.chrome")
                || pacote.startsWith("com.chrome.")) return;   // nunca lê os avisos do próprio China Engine
        Notification n = sbn.getNotification();
        if (n == null || n.extras == null) return;
        Bundle ex = n.extras;
        CharSequence titulo = ex.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence grande = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence texto = ex.getCharSequence(Notification.EXTRA_TEXT);
        // o texto que a tela corta com "…" chega inteiro aqui
        String corpo = grande != null ? grande.toString() : (texto != null ? texto.toString() : "");
        PixEnvio.Pix pix = PixEnvio.interpretar(pacote, titulo == null ? "" : titulo.toString(), corpo);
        if (pix == null) return;
        PixEnvio.registrar(this, pix, pacote, sbn.getPostTime());
    }
}
