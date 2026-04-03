(function () {
  'use strict';

  var store = window.createFundraisingStore();
  var goalAmount = store.goalAmount;
  var animationDuration = 2200;
  var pollIntervalMs = store.config.supabase.pollIntervalMs;

  var hasAnimatedStats = false;
  var previousSummary = null;
  var finalizeTimer = null;
  var pollTimer = null;
  var unsubscribeSummary = function () {};

  function formatNumber(value) {
    return Math.round(value).toLocaleString('th-TH');
  }

  function animateValue(element, start, end, duration, formatter) {
    var startTime = performance.now();

    function update(currentTime) {
      var elapsed = currentTime - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(start + (end - start) * eased);
      element.textContent = formatter ? formatter(current) : current;
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  function setMetric(element, value, unit, prefix) {
    element.innerHTML = (prefix || '') + formatNumber(value) + '<span class="unit">' + unit + '</span>';
  }

  function setLastDonation(element, amount) {
    if (amount > 0) {
      setMetric(element, amount, 'บาท', '+');
    } else {
      element.innerHTML = '—<span class="unit">บาท</span>';
    }
  }

  function renderUpdatedText(summary) {
    var updatedText = document.getElementById('updatedText');
    if (!updatedText) {
      return;
    }

    if (summary.lastUpdatedLabel) {
      updatedText.textContent = 'อัปเดตล่าสุดเมื่อ ' + summary.lastUpdatedLabel;
    } else if (store.hasRemote) {
      updatedText.textContent = 'รอข้อมูลล่าสุดจาก Supabase';
    } else {
      updatedText.textContent = 'ยังไม่ได้ตั้งค่า Supabase';
    }
  }

  function addSparkles(phaseNumber) {
    var container = document.getElementById('sparkleContainer');
    var wrap = document.getElementById('buildingWrap');
    if (!container || !wrap) {
      return;
    }

    var zones = {
      1: [{ x: 30, y: 85 }, { x: 50, y: 88 }, { x: 70, y: 86 }, { x: 45, y: 90 }],
      2: [{ x: 25, y: 55 }, { x: 50, y: 60 }, { x: 75, y: 55 }, { x: 40, y: 70 }],
      3: [{ x: 30, y: 35 }, { x: 50, y: 20 }, { x: 70, y: 35 }, { x: 55, y: 28 }],
      4: [{ x: 25, y: 50 }, { x: 42, y: 62 }, { x: 58, y: 62 }, { x: 75, y: 50 }, { x: 10, y: 72 }, { x: 90, y: 72 }],
    };

    (zones[phaseNumber] || zones[4]).forEach(function (spot, index) {
      var sparkle = document.createElement('div');
      sparkle.className = 'sparkle';
      sparkle.style.left = spot.x + '%';
      sparkle.style.top = spot.y + '%';
      sparkle.style.animationDelay = (index * 0.4) + 's';
      sparkle.style.width = (4 + Math.random() * 4) + 'px';
      sparkle.style.height = sparkle.style.width;
      container.appendChild(sparkle);
    });
  }

  function updateBuildingPhases(percent) {
    var phases = [
      { id: 'phase1', min: 1, max: 20 },
      { id: 'phase2', min: 21, max: 50 },
      { id: 'phase3', min: 51, max: 80 },
      { id: 'phase4', min: 81, max: 100 },
    ];

    var sparkleContainer = document.getElementById('sparkleContainer');
    if (sparkleContainer) {
      sparkleContainer.innerHTML = '';
    }

    var highestFunded = 0;

    phases.forEach(function (phase, index) {
      var group = document.getElementById(phase.id);
      var dot = document.querySelector('.phase-dot[data-phase="' + (index + 1) + '"]');
      var card = document.querySelector('.phase-card[data-phase-card="' + (index + 1) + '"]');

      if (!group) {
        return;
      }

      group.classList.remove('funded');
      group.classList.add('unfunded');
      if (dot) {
        dot.classList.remove('filled', 'partial');
      }
      if (card) {
        card.classList.remove('funded', 'partial');
      }

      if (percent >= phase.max) {
        group.classList.remove('unfunded');
        group.classList.add('funded');
        if (dot) {
          dot.classList.add('filled');
        }
        if (card) {
          card.classList.add('funded');
        }
        highestFunded = index + 1;
      } else if (percent >= phase.min) {
        group.classList.remove('unfunded');
        group.classList.add('funded');
        if (dot) {
          dot.classList.add('partial');
        }
        if (card) {
          card.classList.add('partial');
        }
        highestFunded = index + 1;
      }
    });

    if (highestFunded > 0) {
      addSparkles(highestFunded);
    }
  }

  function renderStats(summary) {
    var percent = goalAmount > 0 ? Math.min(Math.round((summary.totalAmount / goalAmount) * 100), 100) : 0;
    var percentEl = document.getElementById('percentNumber');
    var raisedEl = document.getElementById('raisedAmount');
    var lastDonationEl = document.getElementById('lastDonation');
    var goalEl = document.getElementById('goalAmount');
    var donorEl = document.getElementById('donorCount');
    var progressBar = document.getElementById('progressBar');

    if (!percentEl || !raisedEl || !lastDonationEl || !goalEl || !donorEl || !progressBar) {
      return;
    }

    if (!hasAnimatedStats) {
      if (finalizeTimer) {
        clearTimeout(finalizeTimer);
      }

      animateValue(percentEl, 0, percent, animationDuration);
      animateValue(raisedEl, 0, summary.totalAmount, animationDuration, formatNumber);
      animateValue(goalEl, 0, goalAmount, animationDuration, formatNumber);
      animateValue(donorEl, 0, summary.donorCount, animationDuration, formatNumber);

      finalizeTimer = setTimeout(function () {
        setMetric(raisedEl, summary.totalAmount, 'บาท');
        setMetric(goalEl, goalAmount, 'บาท');
        setMetric(donorEl, summary.donorCount, 'ราย');
        setLastDonation(lastDonationEl, summary.lastDonationAmount);
      }, animationDuration + 50);
    } else {
      percentEl.textContent = String(percent);
      setMetric(raisedEl, summary.totalAmount, 'บาท');
      setMetric(goalEl, goalAmount, 'บาท');
      setMetric(donorEl, summary.donorCount, 'ราย');
      setLastDonation(lastDonationEl, summary.lastDonationAmount);
    }

    requestAnimationFrame(function () {
      progressBar.style.width = percent + '%';
    });

    renderUpdatedText(summary);
    updateBuildingPhases(percent);
    hasAnimatedStats = true;
  }

  function summariesMatch(left, right) {
    if (!left || !right) {
      return false;
    }

    return (
      left.totalAmount === right.totalAmount &&
      left.donorCount === right.donorCount &&
      left.lastDonationAmount === right.lastDonationAmount &&
      left.lastUpdatedLabel === right.lastUpdatedLabel &&
      left.updatedAt === right.updatedAt
    );
  }

  function initTooltips() {
    var wrap = document.getElementById('buildingWrap');
    if (!wrap) {
      return;
    }

    var tooltip = document.createElement('div');
    tooltip.className = 'phase-tooltip';
    wrap.appendChild(tooltip);

    wrap.querySelectorAll('.phase-group').forEach(function (phase) {
      phase.style.cursor = 'pointer';
      phase.addEventListener('mouseenter', function () {
        var name = phase.getAttribute('data-name');
        var range = phase.getAttribute('data-range');
        var cost = phase.getAttribute('data-cost');
        var num = phase.getAttribute('data-phase');
        tooltip.textContent = 'ขั้นที่ ' + num + ': ' + name + ' — ' + range + ' / ' + cost;
        tooltip.style.opacity = '1';
      });

      phase.addEventListener('mousemove', function (event) {
        var rect = wrap.getBoundingClientRect();
        tooltip.style.left = (event.clientX - rect.left) + 'px';
        tooltip.style.top = (event.clientY - rect.top) + 'px';
      });

      phase.addEventListener('mouseleave', function () {
        tooltip.style.opacity = '0';
      });
    });
  }

  function initDetailsToggle() {
    var button = document.getElementById('detailsToggle');
    var content = document.getElementById('detailsContent');
    if (!button || !content) {
      return;
    }

    button.addEventListener('click', function () {
      var isOpen = button.classList.contains('open');
      if (isOpen) {
        content.style.maxHeight = '0';
        button.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        button.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  }

  function initFadeIn() {
    var elements = document.querySelectorAll('.fade-in');
    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (element) {
        element.classList.add('visible');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    elements.forEach(function (element) {
      observer.observe(element);
    });
  }

  function initDonationButton() {
    var donateButton = document.getElementById('ctaDonateBtn');
    var paymentDetails = document.getElementById('paymentDetails');
    if (!donateButton || !paymentDetails) {
      return;
    }

    donateButton.addEventListener('click', function () {
      paymentDetails.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function refreshSummary() {
    try {
      var summary = await store.loadSummary();
      if (!summariesMatch(previousSummary, summary)) {
        previousSummary = summary;
        renderStats(summary);
      }
    } catch (error) {
      console.error('Failed to load fundraising summary from Supabase', error);
      if (!hasAnimatedStats) {
        var cachedSummary = store.readCachedSummary();
        previousSummary = cachedSummary;
        renderStats(cachedSummary);
      }
    }
  }

  function startSync() {
    if (!store.hasRemote) {
      return;
    }

    unsubscribeSummary = store.subscribeToSummary(function (summary) {
      if (!summariesMatch(previousSummary, summary)) {
        previousSummary = summary;
        renderStats(summary);
      }
    }, function (error) {
      console.error(error);
    });

    pollTimer = window.setInterval(function () {
      refreshSummary();
    }, pollIntervalMs);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTooltips();
    initDetailsToggle();
    initFadeIn();
    initDonationButton();
    refreshSummary();
    startSync();

    window.addEventListener('beforeunload', function () {
      unsubscribeSummary();
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    });
  });
})();
