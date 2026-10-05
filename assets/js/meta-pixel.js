// Meta pixel for the digital product pages, shared so every product reports to the
// same dataset. Loads Meta's standard snippet, records a PageView, and exposes a
// small helper the page scripts call for checkout and purchase events.
//
// It also remembers which ad brought the visitor (utm_content, e.g. HCC-A2) for the
// rest of the visit, so checkout can tag the sale with it even after they browse.
(function () {
  var PIXEL_ID = "4207276016235953";

  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");

  var AD_CODE_KEY = "fenningtonAdCode";
  try {
    var code = (new URLSearchParams(window.location.search).get("utm_content") || "").trim().toUpperCase();
    if (/^[A-Z]{2,6}-A\d{1,2}$/.test(code)) window.sessionStorage.setItem(AD_CODE_KEY, code);
  } catch (error) {
    // Storage can be blocked; attribution is a nice-to-have, never a blocker.
  }

  window.fenningtonPixel = {
    adCode: function () {
      try { return window.sessionStorage.getItem(AD_CODE_KEY) || ""; } catch (error) { return ""; }
    },
    track: function (eventName, params, eventId) {
      if (typeof window.fbq !== "function") return;
      window.fbq("track", eventName, params || {}, eventId ? { eventID: eventId } : undefined);
    }
  };
}());
