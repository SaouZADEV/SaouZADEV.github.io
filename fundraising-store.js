(function (global) {
  'use strict';

  function getRuntimeConfig() {
    var runtime = global.FUNDRAISING_CONFIG || {};
    var supabaseConfig = runtime.supabase || {};

    return {
      goalAmount: typeof runtime.goalAmount === 'number' ? runtime.goalAmount : 1000000,
      supabase: {
        url: String(supabaseConfig.url || '').trim(),
        anonKey: String(supabaseConfig.anonKey || '').trim(),
        summaryTable: String(supabaseConfig.summaryTable || 'fundraising_summary').trim(),
        donationsTable: String(supabaseConfig.donationsTable || 'fundraising_donations').trim(),
        summaryRowId: Number(supabaseConfig.summaryRowId) || 1,
        enableRealtime: supabaseConfig.enableRealtime !== false,
        pollIntervalMs: Math.max(5000, Number(supabaseConfig.pollIntervalMs) || 15000),
      },
    };
  }

  function hasSupabaseConfig(config) {
    return Boolean(config.supabase.url && config.supabase.anonKey);
  }

  function toNumber(value) {
    var numberValue = Number(value);
    return isFinite(numberValue) ? numberValue : 0;
  }

  function extractMissingTableName(message) {
    var text = String(message || '');
    var match = text.match(/table '([^']+)'/);
    return match ? match[1] : '';
  }

  function normalizeSupabaseError(error) {
    var source = error && typeof error === 'object' ? error : {};
    var code = String(source.code || '');
    var message = String(source.message || '');
    var userMessage = message || 'Supabase request failed';

    if (code === 'PGRST205' || code === '42P01') {
      var tableName = extractMissingTableName(message);
      userMessage = 'Supabase tables are missing. Run supabase/schema.sql in the Supabase SQL Editor first' +
        (tableName ? ' (' + tableName + ').' : '.');
    } else if (code === '42501') {
      userMessage = 'This account does not have permission to access the fundraising tables.';
    }

    var wrapped = new Error(userMessage);
    wrapped.code = code;
    wrapped.details = source.details || '';
    wrapped.hint = source.hint || '';
    wrapped.original = source;
    return wrapped;
  }

  function normalizeSummary(rawSummary) {
    var summary = rawSummary && typeof rawSummary === 'object' ? rawSummary : {};

    return {
      totalAmount: Math.max(0, Math.round(toNumber(summary.total_amount != null ? summary.total_amount : summary.totalAmount))),
      donorCount: Math.max(0, Math.round(toNumber(summary.donor_count != null ? summary.donor_count : summary.donorCount))),
      lastDonationAmount: Math.max(0, Math.round(toNumber(summary.last_donation_amount != null ? summary.last_donation_amount : summary.lastDonationAmount))),
      lastUpdatedLabel: String(summary.last_updated_label != null ? summary.last_updated_label : (summary.lastUpdatedLabel || '')),
      updatedAt: String(summary.updated_at != null ? summary.updated_at : (summary.updatedAt || '')),
    };
  }

  function normalizeDonation(rawDonation) {
    var donation = rawDonation && typeof rawDonation === 'object' ? rawDonation : {};

    return {
      id: donation.id,
      amount: Math.max(0, Math.round(toNumber(donation.amount))),
      donorCount: Math.max(0, Math.round(toNumber(donation.donor_count != null ? donation.donor_count : donation.donorCount))),
      note: String(donation.note || ''),
      dateLabel: String(donation.date_label != null ? donation.date_label : (donation.dateLabel || '')),
      updatedAt: String(donation.updated_at != null ? donation.updated_at : (donation.updatedAt || '')),
    };
  }

  function readCachedSummary() {
    return normalizeSummary({
      totalAmount: localStorage.getItem('fundraising_raisedAmount'),
      donorCount: localStorage.getItem('fundraising_donorCount'),
      lastDonationAmount: localStorage.getItem('fundraising_lastDonation'),
      lastUpdatedLabel: localStorage.getItem('fundraising_lastUpdated') || '',
      updatedAt: localStorage.getItem('fundraising_updatedAt') || '',
    });
  }

  function cacheSummary(summary) {
    localStorage.setItem('fundraising_raisedAmount', String(summary.totalAmount));
    localStorage.setItem('fundraising_donorCount', String(summary.donorCount));
    localStorage.setItem('fundraising_lastDonation', String(summary.lastDonationAmount));
    localStorage.setItem('fundraising_lastUpdated', summary.lastUpdatedLabel || '');
    localStorage.setItem('fundraising_updatedAt', summary.updatedAt || '');
  }

  function createSupabaseClient(config) {
    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      throw new Error('Supabase client library is not loaded');
    }

    return global.supabase.createClient(config.supabase.url, config.supabase.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  function createFundraisingStore() {
    var config = getRuntimeConfig();
    var remoteEnabled = hasSupabaseConfig(config);
    var client = null;

    function getClient() {
      if (!remoteEnabled) {
        throw new Error('Supabase is not configured');
      }

      if (!client) {
        client = createSupabaseClient(config);
      }

      return client;
    }

    async function loadSummary() {
      if (!remoteEnabled) {
        return readCachedSummary();
      }

      var response = await getClient()
        .from(config.supabase.summaryTable)
        .select('id, total_amount, donor_count, last_donation_amount, last_updated_label, updated_at')
        .eq('id', config.supabase.summaryRowId)
        .limit(1);

      if (response.error) {
        throw normalizeSupabaseError(response.error);
      }

      var row = Array.isArray(response.data) && response.data.length > 0 ? response.data[0] : null;
      var summary = normalizeSummary(row);
      cacheSummary(summary);
      return summary;
    }

    async function loadDonations() {
      if (!remoteEnabled) {
        return [];
      }

      var response = await getClient()
        .from(config.supabase.donationsTable)
        .select('id, amount, donor_count, note, date_label, updated_at')
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true });

      if (response.error) {
        throw normalizeSupabaseError(response.error);
      }

      return (response.data || []).map(normalizeDonation);
    }

    function subscribeToSummary(callback, onError) {
      if (!remoteEnabled || !config.supabase.enableRealtime) {
        return function () {};
      }

      var channel = getClient()
        .channel('fundraising-summary-' + config.supabase.summaryRowId)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: config.supabase.summaryTable,
          filter: 'id=eq.' + config.supabase.summaryRowId,
        }, function (payload) {
          var summary = normalizeSummary(payload.new || payload.record || {});
          cacheSummary(summary);
          callback(summary);
        })
        .subscribe(function (status) {
          if (status === 'CHANNEL_ERROR' && typeof onError === 'function') {
            onError(new Error('Supabase realtime summary channel failed'));
          }
        });

      return function () {
        if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      };
    }

    function subscribeToDonations(callback, onError) {
      if (!remoteEnabled || !config.supabase.enableRealtime) {
        return function () {};
      }

      var channel = getClient()
        .channel('fundraising-donations')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: config.supabase.donationsTable,
        }, function () {
          callback();
        })
        .subscribe(function (status) {
          if (status === 'CHANNEL_ERROR' && typeof onError === 'function') {
            onError(new Error('Supabase realtime donations channel failed'));
          }
        });

      return function () {
        if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      };
    }

    async function signIn(email, password) {
      var response = await getClient().auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (response.error) {
        throw normalizeSupabaseError(response.error);
      }

      return response.data;
    }

    async function signOut() {
      var response = await getClient().auth.signOut();
      if (response.error) {
        throw normalizeSupabaseError(response.error);
      }
    }

    function onAuthStateChange(callback) {
      if (!remoteEnabled) {
        callback('OFFLINE', null);
        return {
          unsubscribe: function () {},
        };
      }

      var subscription = getClient().auth.onAuthStateChange(function (event, session) {
        setTimeout(function () {
          callback(event, session);
        }, 0);
      });

      return subscription && subscription.data && subscription.data.subscription
        ? subscription.data.subscription
        : { unsubscribe: function () {} };
    }

    async function getSession() {
      if (!remoteEnabled) {
        return null;
      }

      var response = await getClient().auth.getSession();
      if (response.error) {
        throw normalizeSupabaseError(response.error);
      }

      return response.data.session;
    }

    async function addDonation(payload) {
      var donation = payload && typeof payload === 'object' ? payload : {};
      var response = await getClient().from(config.supabase.donationsTable).insert({
        amount: Math.max(0, Math.round(toNumber(donation.amount))),
        donor_count: Math.max(0, Math.round(toNumber(donation.donorCount))),
        note: String(donation.note || ''),
        date_label: String(donation.dateLabel || ''),
        updated_at: donation.updatedAt || new Date().toISOString(),
      });

      if (response.error) {
        throw normalizeSupabaseError(response.error);
      }
    }

    async function deleteDonation(donationId) {
      var response = await getClient()
        .from(config.supabase.donationsTable)
        .delete()
        .eq('id', donationId);

      if (response.error) {
        throw normalizeSupabaseError(response.error);
      }
    }

    return {
      config: config,
      goalAmount: config.goalAmount,
      mode: remoteEnabled ? 'supabase' : 'offline',
      hasRemote: remoteEnabled,
      loadSummary: loadSummary,
      loadDonations: loadDonations,
      subscribeToSummary: subscribeToSummary,
      subscribeToDonations: subscribeToDonations,
      signIn: signIn,
      signOut: signOut,
      onAuthStateChange: onAuthStateChange,
      getSession: getSession,
      addDonation: addDonation,
      deleteDonation: deleteDonation,
      readCachedSummary: readCachedSummary,
      cacheSummary: cacheSummary,
    };
  }

  global.getFundraisingRuntimeConfig = getRuntimeConfig;
  global.createFundraisingStore = createFundraisingStore;
})(window);
