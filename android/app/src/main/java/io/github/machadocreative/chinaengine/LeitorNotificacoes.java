package io.github.machadocreative.chinaengine;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Leitor de notificações de recebimento (InfinitePay, Caixa…) — PREPARADO, AINDA DESLIGADO.
 *
 * Próxima etapa: ler só as notificações dos apps escolhidos, extrair valor e forma de pagamento
 * e enviar ao Worker da sincronização, que manda um push "Recebimento de R$ X, registrar?".
 * Nada é registrado sozinho: o China Engine sempre pede confirmação (evita duplicar venda do PDV).
 *
 * Para funcionar, além do código, o usuário precisa liberar o "Acesso a notificações" do app
 * nas configurações do Android. Enquanto o serviço estiver com enabled="false" no
 * AndroidManifest.xml, ele não aparece nessa lista e não lê nada.
 */
public class LeitorNotificacoes extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        // Desligado nesta versão.
    }
}
