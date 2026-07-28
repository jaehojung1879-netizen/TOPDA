// 톺다 공개 Supabase 클라이언트.
// 배포 워크플로가 아래 두 플레이스홀더를 GitHub Actions Secrets로 치환한다.
(function () {
  'use strict';

  const SUPABASE_URL = '__SUPABASE_URL__';
  const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
  const configured = !/^__.*__$/.test(SUPABASE_URL)
    && !/^__.*__$/.test(SUPABASE_ANON_KEY)
    && SUPABASE_URL.length > 8
    && SUPABASE_ANON_KEY.length > 8;

  let clientPromise = null;

  function getClient() {
    if (!configured) return Promise.resolve(null);
    if (!clientPromise) {
      clientPromise = import('https://esm.sh/@supabase/supabase-js@2.110.7')
        .then((mod) => mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
        .catch((error) => {
          if (window.console) console.warn('[Supabase] 클라이언트 초기화 실패:', error);
          return null;
        });
    }
    return clientPromise;
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = Math.random() * 16 | 0;
      const value = char === 'x' ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  window.TopdaSupabase = Object.freeze({
    getClient,
    isConfigured: () => configured,
    isUuid,
    uuid,
  });
})();
