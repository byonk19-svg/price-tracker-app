/**
 * Backend Price Service - MINIMAL DEBUG VERSION
 * Simplified to diagnose invocation issues
 */

export async function triggerBackendPriceSearch(itemId, productName, supabaseClient, userSession) {
  console.log("[BackendService] triggerBackendPriceSearch called", { itemId, productName });

  // Hard fail if missing (so you SEE why)
  if (!itemId) throw new Error("Missing itemId");
  if (!productName) throw new Error("Missing productName");
  if (!supabaseClient) throw new Error("Missing supabaseClient");

  let session = userSession;
  if (!session) {
    const { data: sessionRes } = await supabaseClient.auth.getSession();
    session = sessionRes?.session;
  }
  if (!session) throw new Error("Missing session");
  console.log("[BackendService] session?", true, { userId: session.user?.id });

  const { data, error } = await supabaseClient.functions.invoke("compare-item", {
    body: { itemId, productName },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseClient?.supabaseKey,
    },
  });

  console.log("[BackendService] invoke returned", { data, error });

  if (error) throw error;
  return data;
}
