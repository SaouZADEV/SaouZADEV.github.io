(function () {
  'use strict';

  var store = window.createFundraisingStore();
  var pollIntervalMs = store.config.supabase.pollIntervalMs;

  var loginCard = document.getElementById('loginCard');
  var appRoot = document.getElementById('appRoot');
  var logoutBtn = document.getElementById('logoutBtn');
  var loginForm = document.getElementById('loginForm');
  var donationForm = document.getElementById('donationForm');
  var emailInput = document.getElementById('emailInput');
  var passwordInput = document.getElementById('passwordInput');
  var amountInput = document.getElementById('amountInput');
  var donorCountInput = document.getElementById('donorCountInput');
  var noteInput = document.getElementById('noteInput');
  var loginButton = document.getElementById('loginButton');
  var saveButton = document.getElementById('saveButton');
  var loginError = document.getElementById('loginError');
  var configHint = document.getElementById('configHint');
  var saveError = document.getElementById('saveError');
  var saveHint = document.getElementById('saveHint');
  var currentAmount = document.getElementById('currentAmount');
  var currentDonorCount = document.getElementById('currentDonorCount');
  var lastDonationAmount = document.getElementById('lastDonationAmount');
  var lastUpdatedLabel = document.getElementById('lastUpdatedLabel');
  var donationsBody = document.getElementById('donationsBody');

  var currentSummary = null;
  var currentDonations = [];
  var unsubscribeSummary = function () {};
  var unsubscribeDonations = function () {};
  var authSubscription = null;
  var pollTimer = null;
  var appVisible = false;

  function formatNumber(value) {
    return Math.round(value).toLocaleString('th-TH');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getThaiDateTimeLabel() {
    var formatter = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    });

    return formatter.format(new Date()) + ' น.';
  }

  function showBanner(element, message) {
    if (!message) {
      element.textContent = '';
      element.classList.remove('visible');
      return;
    }

    element.textContent = message;
    element.classList.add('visible');
  }

  function setButtonLoading(button, loading, loadingLabel, idleLabel) {
    button.disabled = loading;
    button.textContent = loading ? loadingLabel : idleLabel;
  }

  function renderSummary(summary) {
    currentSummary = summary;
    currentAmount.textContent = formatNumber(summary.totalAmount) + ' บาท';
    currentDonorCount.textContent = formatNumber(summary.donorCount) + ' ราย';
    lastDonationAmount.textContent = summary.lastDonationAmount > 0 ? '+' + formatNumber(summary.lastDonationAmount) + ' บาท' : '— บาท';
    lastUpdatedLabel.textContent = summary.lastUpdatedLabel || '—';
  }

  function renderDonations(donations) {
    currentDonations = donations.slice();

    if (donations.length === 0) {
      donationsBody.innerHTML = '<tr><td class="empty" colspan="6">ยังไม่มีรายการ</td></tr>';
      return;
    }

    var html = '';
    for (var index = donations.length - 1; index >= 0; index -= 1) {
      var donation = donations[index];
      html += '<tr>' +
        '<td>' + (index + 1) + '</td>' +
        '<td class="amount-cell">+' + formatNumber(donation.amount) + ' บาท</td>' +
        '<td>' + formatNumber(donation.donorCount) + '</td>' +
        '<td>' + escapeHtml(donation.note || '-') + '</td>' +
        '<td class="date-cell">' + escapeHtml(donation.dateLabel || '-') + '</td>' +
        '<td><button class="delete-btn" type="button" data-id="' + escapeHtml(String(donation.id)) + '">ลบ</button></td>' +
      '</tr>';
    }

    donationsBody.innerHTML = html;
    donationsBody.querySelectorAll('.delete-btn').forEach(function (button) {
      button.addEventListener('click', handleDeleteClick);
    });
  }

  async function refreshDashboard() {
    var result = await Promise.all([
      store.loadSummary(),
      store.loadDonations(),
    ]);

    renderSummary(result[0]);
    renderDonations(result[1]);
  }

  function startSync() {
    stopSync();

    if (!store.hasRemote) {
      return;
    }

    unsubscribeSummary = store.subscribeToSummary(function (summary) {
      renderSummary(summary);
    }, function (error) {
      console.error(error);
    });

    unsubscribeDonations = store.subscribeToDonations(function () {
      refreshDashboard().catch(function (error) {
        console.error(error);
      });
    }, function (error) {
      console.error(error);
    });

    pollTimer = window.setInterval(function () {
      refreshDashboard().catch(function (error) {
        console.error(error);
      });
    }, pollIntervalMs);
  }

  function stopSync() {
    unsubscribeSummary();
    unsubscribeDonations();
    unsubscribeSummary = function () {};
    unsubscribeDonations = function () {};

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showLoginState() {
    appVisible = false;
    loginCard.style.display = 'block';
    appRoot.style.display = 'none';
    logoutBtn.style.display = 'none';
    donationForm.reset();
    amountInput.value = '';
    donorCountInput.value = '0';
  }

  function showAppState() {
    appVisible = true;
    loginCard.style.display = 'none';
    appRoot.style.display = 'block';
    logoutBtn.style.display = 'inline-flex';
  }

  function getLoginErrorMessage(error) {
    var code = error && error.code ? error.code : '';
    if (code === 'invalid_credentials' || code === 'auth/invalid-credential' || code === 'auth/invalid_login_credentials') {
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    }

    if (code === 'email_not_confirmed') {
      return 'บัญชียังไม่ยืนยันอีเมล';
    }

    if (error && error.message) {
      return error.message;
    }

    return 'เข้าสู่ระบบไม่สำเร็จ';
  }

  async function handleDeleteClick(event) {
    var donationId = event.currentTarget.getAttribute('data-id');
    if (!donationId) {
      return;
    }

    if (!window.confirm('ลบรายการนี้ใช่หรือไม่')) {
      return;
    }

    showBanner(saveError, '');
    showBanner(saveHint, '');

    try {
      await store.deleteDonation(donationId);
      await refreshDashboard();
      showBanner(saveHint, 'ลบรายการเรียบร้อยแล้ว');
    } catch (error) {
      console.error(error);
      showBanner(saveError, error.message || 'ลบรายการไม่สำเร็จ');
    }
  }

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    showBanner(loginError, '');
    showBanner(configHint, '');

    if (!store.hasRemote) {
      showBanner(configHint, 'ยังไม่ได้ตั้งค่า Supabase URL และ anon key ใน fundraising-config.js');
      return;
    }

    setButtonLoading(loginButton, true, 'กำลังเข้าสู่ระบบ...', 'เข้าสู่ระบบ');

    try {
      await store.signIn(emailInput.value.trim(), passwordInput.value);
    } catch (error) {
      console.error(error);
      showBanner(loginError, getLoginErrorMessage(error));
    } finally {
      setButtonLoading(loginButton, false, 'กำลังเข้าสู่ระบบ...', 'เข้าสู่ระบบ');
    }
  });

  donationForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    showBanner(saveError, '');
    showBanner(saveHint, '');

    var amount = Number(amountInput.value || 0);
    var donorCount = Number(donorCountInput.value || 0);

    if (!amount || amount <= 0) {
      showBanner(saveError, 'กรุณากรอกจำนวนเงินที่มากกว่า 0');
      amountInput.focus();
      return;
    }

    setButtonLoading(saveButton, true, 'กำลังบันทึก...', 'บันทึกรายการ');

    try {
      await store.addDonation({
        amount: amount,
        donorCount: donorCount,
        note: noteInput.value.trim(),
        dateLabel: getThaiDateTimeLabel(),
        updatedAt: new Date().toISOString(),
      });
      await refreshDashboard();
      donationForm.reset();
      donorCountInput.value = '0';
      amountInput.focus();
      showBanner(saveHint, 'บันทึกรายการเรียบร้อยแล้ว');
    } catch (error) {
      console.error(error);
      showBanner(saveError, error.message || 'บันทึกรายการไม่สำเร็จ');
    } finally {
      setButtonLoading(saveButton, false, 'กำลังบันทึก...', 'บันทึกรายการ');
    }
  });

  logoutBtn.addEventListener('click', async function () {
    try {
      await store.signOut();
    } catch (error) {
      console.error(error);
      showBanner(saveError, error.message || 'ออกจากระบบไม่สำเร็จ');
    }
  });

  function bindAuthState() {
    authSubscription = store.onAuthStateChange(function (event, session) {
      if (event === 'OFFLINE') {
        showLoginState();
        showBanner(configHint, 'ยังไม่ได้ตั้งค่า Supabase URL และ anon key ใน fundraising-config.js');
        return;
      }

      if (session && session.user) {
        showAppState();
        refreshDashboard().catch(function (error) {
          console.error(error);
          showBanner(saveError, error.message || 'โหลดข้อมูลไม่สำเร็จ');
        });
        startSync();
        return;
      }

      stopSync();
      showLoginState();
      showBanner(saveHint, '');
      showBanner(saveError, '');
    });
  }

  async function init() {
    if (!store.hasRemote) {
      showLoginState();
      showBanner(configHint, 'ยังไม่ได้ตั้งค่า Supabase URL และ anon key ใน fundraising-config.js');
      return;
    }

    bindAuthState();

    try {
      var session = await store.getSession();
      if (session && session.user) {
        showAppState();
        await refreshDashboard();
        startSync();
      } else {
        showLoginState();
      }
    } catch (error) {
      console.error(error);
      showLoginState();
      showBanner(loginError, error.message || 'ตรวจสอบ session ไม่สำเร็จ');
    }
  }

  window.addEventListener('beforeunload', function () {
    stopSync();
    if (authSubscription && typeof authSubscription.unsubscribe === 'function') {
      authSubscription.unsubscribe();
    }
  });

  init();
})();
