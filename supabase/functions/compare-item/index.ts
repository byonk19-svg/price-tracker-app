// Supabase Edge Function: compare-item
// Performs cross-retailer price comparison and writes offers/price_snapshots

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.2";

const RATE_LIMIT_DELAY = 1500;
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000;

const DEBUG = true; // Changed to true for debugging
const MIN_CONFIDENCE = 0.7;
const EXPECTED_RETAILERS = ["walmart", "amazon", "target"] as const;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProductTitle(title?: string | null) {
  if (!title) return "";
  return title
    .toLowerCase()
    .trim()
    .replace(/\s*-\s*(amazon|walmart|target).*$/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function matchProductsAcrossRetailers(sourceProduct: any, candidateProduct: any) {
  let confidence = 0;
  const matchingReason: string[] = [];

  if (sourceProduct.upc && candidateProduct.upc && sourceProduct.upc === candidateProduct.upc) {
    return { confidence: 1.0, reason: "Exact UPC/EAN match", matched: true };
  }

  if (
    sourceProduct.brand &&
    candidateProduct.brand &&
    sourceProduct.model &&
    candidateProduct.model &&
    sourceProduct.brand.toLowerCase() === candidateProduct.brand.toLowerCase() &&
    sourceProduct.model.toLowerCase() === candidateProduct.model.toLowerCase()
  ) {
    return { confidence: 0.95, reason: "Exact brand and model match", matched: true };
  }

  const sourcePack = sourceProduct.packSize?.toString().trim();
  const candidatePack = candidateProduct.packSize?.toString().trim();
  if (sourcePack && candidatePack && sourcePack !== candidatePack) {
    return { confidence: 0, reason: `Pack size mismatch: ${sourcePack} vs ${candidatePack}`, matched: false };
  }
  if (!sourcePack || !candidatePack) {
    matchingReason.push("pack size unknown");
  }

  if (sourceProduct.brand && candidateProduct.brand) {
    if (sourceProduct.brand.toLowerCase() === candidateProduct.brand.toLowerCase()) {
      confidence += 0.35;
      matchingReason.push("brand match");
    }
  }

  const sourceTokens = normalizeProductTitle(sourceProduct.title)
    .split(" ")
    .filter((t) => t.length > 2);
  const candidateTokens = normalizeProductTitle(candidateProduct.title)
    .split(" ")
    .filter((t) => t.length > 2);
  if (sourceTokens.length > 0 && candidateTokens.length > 0) {
    const sourceSet = new Set(sourceTokens);
    const candidateSet = new Set(candidateTokens);
    const intersection = [...sourceSet].filter((t) => candidateSet.has(t)).length;
    const titleSimilarity = intersection / Math.max(sourceSet.size, candidateSet.size);
    confidence += titleSimilarity * 0.45;
    matchingReason.push(`title similarity: ${(titleSimilarity * 100).toFixed(0)}%`);
  }

  if (sourceProduct.variants && candidateProduct.variants) {
    const variantMatches = sourceProduct.variants.filter((v: string) =>
      candidateProduct.variants.some((cv: string) => v.toLowerCase() === cv.toLowerCase())
    ).length;
    const variantSimilarity = variantMatches / Math.max(sourceProduct.variants.length, candidateProduct.variants.length);
    confidence += variantSimilarity * 0.2;
    if (variantMatches > 0) matchingReason.push(`variant match: ${variantMatches}/${sourceProduct.variants.length}`);
  }

  confidence = Math.min(confidence, 1.0);

  return {
    confidence,
    reason: matchingReason.length > 0 ? matchingReason.join(", ") : "Basic match",
    matched: confidence >= MIN_CONFIDENCE,
  };
}

function extractUPC(html: string) {
  let match = html.match(/<meta[^>]+property=["']product:ean["'][^>]+content=["'](\d{8,14})["']/i);
  if (match) return match[1];
  match = html.match(/<meta[^>]+name=["']ean["'][^>]+content=["'](\d{8,14})["']/i);
  if (match) return match[1];
  const jsonLd = html.match(/<script[^>]*type=["']application\/ld\+json["']>([^<]+)<\/script>/i);
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd[1]);
      if (data.gtin13 || data.gtin12 || data.gtin8) {
        return data.gtin13 || data.gtin12 || data.gtin8;
      }
    } catch (_e) {}
  }
  return null;
}

function extractBrand(html: string) {
  let match = html.match(/<meta[^>]+property=["']product:brand["'][^>]+content=["']([^"']+)["']/i);
  if (match) return match[1].trim();
  match = html.match(/<span[^>]*class=["'][^"']*brand[^"']*["'][^>]*>([^<]+)<\/span>/i);
  if (match) return match[1].trim();
  return null;
}

function extractPackSize(title?: string | null, html?: string) {
  if (!title) return null;
  const patterns = [
    /(\d+)\s*[-\s]*pack/i,
    /pack\s+of\s+(\d+)/i,
    /(\d+)\s*(?:count|ct|pcs|pieces?)/i,
    /(\d+)\s*(?:wipes?|sheets?|tablets?|capsules?)/i,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }
  const htmlMatch = html?.match(/"quantity"\s*:\s*"([^"]+)"/i);
  if (htmlMatch) return htmlMatch[1];
  return null;
}

function extractModelNumber(html: string) {
  let match = html.match(/<meta[^>]+property=["']product:model["'][^>]+content=["']([^"']+)["']/i);
  if (match) return match[1].trim();
  return null;
}

function extractVariants(title?: string | null) {
  const variants: string[] = [];
  if (!title) return null;
  const variantPatterns = [
    /(?:scent|fragrance|perfume)[\s:]*([\w\s&]+?)(?:\s+|$|,|-)/i,
    /(fresh|clean|original|sensitive|hypoallergenic|lavender|citrus|unscented)/i,
    /(formula|advanced|complete|deep)/i,
  ];
  for (const pattern of variantPatterns) {
    const match = title.match(pattern);
    if (match) variants.push(match[1].trim());
  }
  return variants.length > 0 ? variants : null;
}

function extractImageFromHtml(html: string) {
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch) return ogMatch[1];

  let match =
    html.match(/<img[^>]+id=["']landingImage["'][^>]+src=["']([^"']+)["']/i) ||
    html.match(/<img[^>]+data-old-hires=["']([^"']+)["']/i);
  if (match) return match[1];

  match =
    html.match(/<img[^>]+class=["'][^"']*prod-hero-image[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (match) return match[1];

  return null;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries) throw error;
      const delay = RETRY_DELAY * Math.pow(2, i);
      if (DEBUG) console.log(`Retry ${i + 1}/${retries} after ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw new Error("retryWithBackoff failed");
}

// FIXED: Amazon price extraction with better patterns
async function searchAmazonPrice(productName: string) {
  try {
    console.log("[Amazon] Starting search for:", productName);
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(productName)}`;
    const response = await fetch(searchUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
    });
    const html = await response.text();

    let imageUrl: string | null = null;
    let productUrl: string | null = null;
    let productId: string | null = null;

    const asinMatches = html.matchAll(/data-asin="([A-Z0-9]{10})"/gi);
    const asins = [...asinMatches].map((m) => m[1]).filter((a) => a && a !== "undefined");
    
    if (asins.length > 0) {
      productId = asins[0];
      productUrl = `https://www.amazon.com/dp/${productId}`;
      console.log("[Amazon] Found product URL:", productUrl);
    }

    if (productUrl) {
      const productResponse = await fetch(productUrl, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      const productHtml = await productResponse.text();
      
      // FIXED: Multiple price extraction patterns
      let price: number | null = null;
      
      // Pattern 1: Whole + fraction (most common)
      const wholeFractionMatch = productHtml.match(/<span class="a-price-whole">([^<]+)<\/span><span class="a-price-fraction">([^<]+)<\/span>/);
      if (wholeFractionMatch) {
        const whole = wholeFractionMatch[1].replace(/[,\s]/g, '');
        const fraction = wholeFractionMatch[2];
        price = parseFloat(whole + fraction);
        console.log("[Amazon] Found price (whole+fraction):", price);
      }
      
      // Pattern 2: JSON price
      if (!price) {
        const jsonMatch = productHtml.match(/"price"\s*:\s*"?\$?([\d,]+\.?\d*)"/);
        if (jsonMatch) {
          price = parseFloat(jsonMatch[1].replace(/,/g, ''));
          console.log("[Amazon] Found price (JSON):", price);
        }
      }
      
      // Pattern 3: Simple dollar format
      if (!price) {
        const dollarMatch = productHtml.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
        if (dollarMatch) {
          price = parseFloat(dollarMatch[1].replace(/,/g, ''));
          console.log("[Amazon] Found price (dollar):", price);
        }
      }
      
      if (price && price > 0 && price < 100000) {
        const titleMatch = productHtml.match(/<span id="productTitle"[^>]*>([^<]+)<\/span>/i);
        const title = titleMatch ? titleMatch[1].trim() : null;
        imageUrl = extractImageFromHtml(productHtml);
        const upc = extractUPC(productHtml);
        const brand = extractBrand(productHtml);
        const packSize = extractPackSize(title, productHtml);
        const model = extractModelNumber(productHtml);
        const variants = extractVariants(title);
        
        console.log("[Amazon] Success:", { price, title: title?.substring(0, 50) });
        return { 
          price, 
          image: imageUrl, 
          url: productUrl, 
          title, 
          id: productId, 
          upc, 
          brand, 
          packSize, 
          model, 
          variants, 
          in_stock: true 
        };
      } else {
        console.log("[Amazon] Invalid or no price found");
      }
    } else {
      console.log("[Amazon] No product URL found");
    }
    return null;
  } catch (error) {
    console.error("[Amazon] Search error:", error);
    return null;
  }
}

async function searchWalmartPrice(productName: string) {
  try {
    console.log("[Walmart] Starting search for:", productName);
    const searchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(productName)}`;
    const response = await fetch(searchUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
    });
    const html = await response.text();

    let imageUrl: string | null = null;
    const linkMatch = html.match(/href="([^"]*\/ip\/[^"]+?)"/i);
    if (linkMatch) {
      let path = linkMatch[1];
      const productUrl = (path.startsWith("http") ? path : `https://www.walmart.com${path}`).replace(/\?.*$/, "");
      console.log("[Walmart] Found product URL:", productUrl);
      
      const itemIdMatch = productUrl.match(/\/ip\/(\d+)/);
      const itemId = itemIdMatch ? itemIdMatch[1] : null;
      const productResponse = await fetch(productUrl, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      const productHtml = await productResponse.text();
      const priceMatch = productHtml.match(/"price":"([\d.]+)"/) || productHtml.match(/\$[\d,]+\.\d{2}/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1] || priceMatch[0].replace(/[$,]/g, ""));
        const titleMatch = productHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].trim() : null;
        imageUrl = extractImageFromHtml(productHtml);
        if (price > 0 && price < 100000) {
          const upc = extractUPC(productHtml);
          const brand = extractBrand(productHtml);
          const packSize = extractPackSize(title, productHtml);
          const model = extractModelNumber(productHtml);
          const variants = extractVariants(title);
          console.log("[Walmart] Success:", { price, title: title?.substring(0, 50) });
          return { price, image: imageUrl, url: productUrl, title, id: itemId, upc, brand, packSize, model, variants, in_stock: true };
        }
      }
    }
    console.log("[Walmart] No valid result found");
    return null;
  } catch (error) {
    console.error("[Walmart] Search error:", error);
    return null;
  }
}

// FIXED: Target price extraction with better patterns and logging
async function searchTargetPrice(productName: string) {
  try {
    console.log("[Target] Starting search for:", productName);
    const searchUrl = `https://www.target.com/s?searchTerm=${encodeURIComponent(productName)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    
    if (!searchResponse.ok) {
      console.error("[Target] Search request failed:", searchResponse.status);
      return null;
    }
    
    const searchHtml = await searchResponse.text();

    // Multiple patterns for finding product link
    let productLinkMatch = searchHtml.match(/href="(\/p\/[^"]+)"/i);
    if (!productLinkMatch) {
      productLinkMatch = searchHtml.match(/<a[^>]+data-test=["']product-title["'][^>]+href=["']([^"']+)["']/i);
    }
    if (!productLinkMatch) {
      productLinkMatch = searchHtml.match(/<a[^>]+href=["'](\/p\/[^"']+)["']/i);
    }
    
    if (!productLinkMatch) {
      console.log("[Target] No product link found in search results");
      return null;
    }

    let productPath = productLinkMatch[1];
    const productUrl = productPath.startsWith("http") ? productPath : `https://www.target.com${productPath}`;
    console.log("[Target] Found product URL:", productUrl);
    
    const tcidMatch = productUrl.match(/\/p\/[^/]+-A-(\d+)/i) || productUrl.match(/\/p\/([^/]+)/);
    const tcin = tcidMatch ? tcidMatch[1] : null;

    const productResponse = await fetch(productUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    
    if (!productResponse.ok) {
      console.error("[Target] Product page request failed:", productResponse.status);
      return null;
    }
    
    const productHtml = await productResponse.text();
    
    // FIXED: Multiple price patterns for Target
    let price: number | null = null;
    
    // Pattern 1: Dollar sign format
    const dollarMatch = productHtml.match(/\$(\d+\.\d{2})/);
    if (dollarMatch) {
      price = parseFloat(dollarMatch[1]);
      console.log("[Target] Found price (dollar format):", price);
    }
    
    // Pattern 2: JSON format
    if (!price) {
      const jsonMatch = productHtml.match(/"price"\s*:\s*([\d.]+)/);
      if (jsonMatch) {
        price = parseFloat(jsonMatch[1]);
        console.log("[Target] Found price (JSON):", price);
      }
    }
    
    // Pattern 3: Price object
    if (!price) {
      const priceObjMatch = productHtml.match(/"current_retail"\s*:\s*([\d.]+)/);
      if (priceObjMatch) {
        price = parseFloat(priceObjMatch[1]);
        console.log("[Target] Found price (price object):", price);
      }
    }
    
    if (!price || price === 0) {
      console.log("[Target] No valid price found");
      return null;
    }

    const image = extractImageFromHtml(productHtml);
    const titleMatch = productHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       productHtml.match(/"product_title"\s*:\s*"([^"]+)"/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    
    if (price > 0 && price < 100000) {
      const upc = extractUPC(productHtml);
      const brand = extractBrand(productHtml);
      const packSize = extractPackSize(title, productHtml);
      const model = extractModelNumber(productHtml);
      const variants = extractVariants(title);
      const result = { 
        price, 
        image, 
        url: productUrl, 
        title, 
        id: tcin, 
        upc, 
        brand, 
        packSize, 
        model, 
        variants, 
        in_stock: true 
      };
      console.log("[Target] Success:", { price, title: title?.substring(0, 50) });
      return result;
    }
    return null;
  } catch (error) {
    console.error("[Target] FAILED:", error);
    return null;
  }
}

async function upsertOffer(itemId: string, retailer: string, payload: any) {
  await supabase.from("offers").upsert(
    {
      item_id: itemId,
      retailer,
      price: payload.price ?? null,
      product_title: payload.product_title ?? null,
      url: payload.url ?? null,
      image_url: payload.image_url ?? null,
      match_confidence: payload.match_confidence ?? null,
      matching_reason: payload.matching_reason ?? null,
      is_match_attempt: payload.is_match_attempt ?? false,
      in_stock: payload.in_stock ?? null,
      checked_at: new Date().toISOString()
    },
    { onConflict: "item_id,retailer" }
  );
}

async function performCompare(itemId: string, productName: string) {
  const prices: Record<string, number> = {};
  const links: Record<string, string> = {};
  const confidences: Record<string, number> = {};
  const matchingReasons: Record<string, string> = {};
  const productTitles: Record<string, string> = {};
  let imageUrl: string | null = null;
  let sourceProduct: any = null;

  const searchers: Record<string, () => Promise<any>> = {
    walmart: () => searchWalmartPrice(productName),
    amazon: () => searchAmazonPrice(productName),
    target: () => searchTargetPrice(productName),
  };

  const retailers = EXPECTED_RETAILERS.map((name) => ({ name, fn: searchers[name] })).filter((r) => !!r.fn);

  for (const retailer of retailers) {
    console.log(`[Edge] Searching ${retailer.name} for "${productName}"...`);
    try {
      const result = await retryWithBackoff(retailer.fn);
      if (result) {
        const referenceProduct = sourceProduct || { title: productName };
        const matchResult = sourceProduct ? matchProductsAcrossRetailers(referenceProduct, result) : { matched: true, confidence: 1.0, reason: "Initial reference product" };

        if (!matchResult.matched || (matchResult.confidence ?? 0) < MIN_CONFIDENCE) {
          console.log(`[Edge] ${retailer.name} product did not match (confidence: ${matchResult.confidence})`);
          await upsertOffer(itemId, retailer.name, {
            price: null,
            product_title: result.title || productName,
            url: null,
            image_url: result.image || null,
            match_confidence: matchResult.confidence || 0,
            matching_reason: `no_match: ${matchResult.reason || "Low confidence"}`,
            is_match_attempt: true,
            in_stock: false,
          });
          continue;
        }

        const matchedConfidence = matchResult.confidence || 1.0;
        const foundTitle = result.title || productName;

        if (!sourceProduct) {
          sourceProduct = result;
        } else {
          confidences[retailer.name] = matchedConfidence;
          matchingReasons[retailer.name] = matchResult.reason;
        }

        prices[retailer.name] = result.price;
        if (!imageUrl && result.image) imageUrl = result.image;
        if (result.url) links[retailer.name] = result.url;

        productTitles[retailer.name] = foundTitle;

        await upsertOffer(itemId, retailer.name, {
          price: Number(result.price.toFixed(2)),
          product_title: foundTitle,
          url: result.url || null,
          image_url: result.image || null,
          match_confidence: matchedConfidence,
          matching_reason: matchResult.reason || "Matched",
          is_match_attempt: false,
          in_stock: true,
        });

        await supabase.from("price_snapshots").insert({
          item_id: itemId,
          retailer: retailer.name,
          price: Number(result.price.toFixed(2)),
          match_confidence: matchedConfidence,
          product_title: productTitles[retailer.name],
          match_method: confidences[retailer.name] !== undefined ? "cross_retailer_match" : "source_product",
          image_url: result.image || null,
          product_id: result.id || null,
          matching_reason: matchResult.reason || "Matched",
          extracted_brand: result.brand || null,
          extracted_pack_size: result.packSize ? result.packSize.toString() : null,
          extracted_model: result.model || null,
          extracted_variants: result.variants ? JSON.stringify(result.variants) : null,
          extracted_upc: result.upc || null,
          is_match_attempt: false,
        });
        
        console.log(`[Edge] ✓ ${retailer.name}: $${result.price.toFixed(2)}`);
      } else {
        console.log(`[Edge] ${retailer.name} returned no results`);
        await upsertOffer(itemId, retailer.name, {
          price: null,
          product_title: productName,
          url: null,
          image_url: null,
          match_confidence: 0,
          matching_reason: "no_match: No results",
          is_match_attempt: true,
          in_stock: false,
        });
      }
    } catch (error) {
      console.error(`[Edge] ${retailer.name} search FAILED:`, error);
      await upsertOffer(itemId, retailer.name, {
        price: null,
        product_title: productName,
        url: null,
        image_url: null,
        match_confidence: 0,
        matching_reason: `search_failed: ${(error as Error).message}`,
        is_match_attempt: true,
        in_stock: false,
      });
    }

    if (retailer !== retailers[retailers.length - 1]) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  const updateData: Record<string, unknown> = {
    price_search_status: "complete",
    compare_status: "done",
    compare_finished_at: new Date().toISOString(),
    compare_last_error: null,
  };
  if (imageUrl) updateData.image_url = imageUrl;
  if (Object.keys(links).length > 0) updateData.retailer_urls = links;

  await supabase.from("items").update(updateData).eq("id", itemId);
  console.log("[Edge] Compare complete. Found prices for:", Object.keys(prices));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, X-Client-Info",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const itemId = body?.itemId;
  const productName = body?.productName;
  
  console.log("[Edge] compare-item invoked", { itemId, productName });
  
  if (!itemId || !productName) {
    return new Response("Missing itemId or productName", { status: 400 });
  }

  await supabase
    .from("items")
    .update({
      compare_status: "running",
      compare_started_at: new Date().toISOString(),
      compare_finished_at: null,
      compare_last_error: null,
      price_search_status: "searching",
      last_price_search: new Date().toISOString(),
    })
    .eq("id", itemId);

  try {
    await performCompare(itemId, productName);
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, X-Client-Info",
      },
    });
  } catch (error) {
    console.error("[Edge] compare-item error:", error);
    await supabase
      .from("items")
      .update({
        compare_status: "failed",
        compare_finished_at: new Date().toISOString(),
        compare_last_error: (error as Error).message,
        price_search_status: "failed",
      })
      .eq("id", itemId);

    return new Response(
      JSON.stringify({ status: "error", message: (error as Error).message }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, X-Client-Info",
},
},
);
}
});