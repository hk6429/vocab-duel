/* 安裝引導：第一輪 10 題完成後才顯示，不在學習前打斷。 */
const VDInstall = (() => {
  let installPrompt = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    localStorage.setItem('vd_pwa_installed', '1');
  });

  async function nativeInstall(button, container) {
    if (!installPrompt) return;
    button.disabled = true;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    afterDailyComplete(container);
  }

  function afterDailyComplete(container) {
    if (!container) return;
    if (isStandalone()) {
      container.innerHTML = `<section class="install-card"><b>✅ 已從主畫面開啟</b><p>進度會保留，下次可直接回來做今日 10 題。</p><div id="pushSettings"></div></section>`;
      if (window.VDPush) VDPush.settingsCard(container.querySelector('#pushSettings'));
      return;
    }
    if (isIOS()) {
      container.innerHTML = `<section class="install-card"><b>📲 把字鬥英雄放進主畫面</b><p>保留進度、快速開啟，安裝後才能自願開啟每日提醒。</p><ol><li>點 Safari 底部的「分享」</li><li>選「加入主畫面」</li><li>從新圖示開啟</li></ol></section>`;
      return;
    }
    if (installPrompt) {
      container.innerHTML = `<section class="install-card"><b>📲 明天從主畫面直接繼續</b><p>安裝後可保留快速入口、使用離線首頁，並自行決定是否接收今日任務。</p><button class="btn" id="installNow">安裝到這台裝置</button></section>`;
      container.querySelector('#installNow').onclick = event => nativeInstall(event.currentTarget, container);
      return;
    }
    container.innerHTML = `<section class="install-card"><b>💡 想更快回來？</b><p>可用瀏覽器選單的「安裝應用程式」或「加入主畫面」；不安裝也能完整使用。</p></section>`;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  return { isStandalone, isIOS, afterDailyComplete };
})();

window.VDInstall = VDInstall;
