export async function getWithFallback(get, url, options) {
  try {
    return await get(url, options);
  } catch (error) {
    if (error.response || options.proxy === false) throw error;
    return get(url, { ...options, proxy: false });
  }
}
