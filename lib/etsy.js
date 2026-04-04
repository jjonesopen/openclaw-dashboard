// ── Etsy Shop Status ─────────────────────────────────────────
// Mock data until API key is approved. Replace fetchMock() with
// real Etsy API calls once ETSY_API_KEY is set in environment.

const ETSY_API_KEY = process.env.ETSY_API_KEY || null;
const ETSY_SHOP_ID = process.env.ETSY_SHOP_ID || null;

// ── Mock data (remove once API key is active) ─────────────────
function fetchMock() {
  return {
    shop: {
      name: 'Braided Technologies',
      status: 'open',
      currency: 'USD',
    },
    orders: {
      todayCount: 3,
      monthCount: 47,
      pending: 2,
      processing: 1,
    },
    revenue: {
      today: 87.50,
      month: 1243.75,
    },
    topItem: {
      name: 'Custom Cable Organizer',
      sold: 14,
    },
    live: false,
  };
}

// ── Real Etsy API (wired up once key is approved) ─────────────
async function fetchLive(timeout = 5000) {
  try {
    const headers = {
      'x-api-key': ETSY_API_KEY,
      'Content-Type': 'application/json',
    };

    const [shopRes, ordersRes] = await Promise.all([
      fetch(`https://openapi.etsy.com/v3/application/shops/${ETSY_SHOP_ID}`,
        { headers, signal: AbortSignal.timeout(timeout) }),
      fetch(`https://openapi.etsy.com/v3/application/shops/${ETSY_SHOP_ID}/receipts?limit=100`,
        { headers, signal: AbortSignal.timeout(timeout) }),
    ]);

    if (!shopRes.ok || !ordersRes.ok) return null;

    const shop = await shopRes.json();
    const ordersData = await ordersRes.json();
    const receipts = ordersData.results || [];

    const today = new Date().toDateString();
    const todayOrders = receipts.filter(r =>
      new Date(r.created_timestamp * 1000).toDateString() === today
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthOrders = receipts.filter(r =>
      new Date(r.created_timestamp * 1000) >= monthStart
    );

    const pending = receipts.filter(r => !r.is_paid || !r.is_shipped).length;

    return {
      shop: {
        name: shop.shop_name,
        status: shop.is_vacation ? 'vacation' : 'open',
        currency: shop.currency_code,
      },
      orders: {
        todayCount: todayOrders.length,
        monthCount: monthOrders.length,
        pending,
        processing: receipts.filter(r => r.is_paid && !r.is_shipped).length,
      },
      revenue: {
        today: todayOrders.reduce((s, r) => s + parseFloat(r.grandtotal?.amount || 0), 0),
        month: monthOrders.reduce((s, r) => s + parseFloat(r.grandtotal?.amount || 0), 0),
      },
      topItem: { name: 'N/A', sold: 0 },
      live: true,
    };
  } catch {
    return null;
  }
}

// ── Aggregate ─────────────────────────────────────────────────
export async function getEtsyState() {
  if (ETSY_API_KEY && ETSY_SHOP_ID) {
    const live = await fetchLive();
    if (live) return live;
  }
  return fetchMock();
}
