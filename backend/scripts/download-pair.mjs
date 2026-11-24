export async function downloadPair(download, zipUrl, dgstUrl) {
  const zip = await download(zipUrl);
  const dgst = await download(dgstUrl);
  return [zip, dgst];
}
