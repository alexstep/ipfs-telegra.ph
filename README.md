# Telegraph

A minimal editor in the style of [telegra.ph](https://telegra.ph): a title, an author, text, links, images, and quotes. Publish turns the article into an IPFS directory (`index.html` and `article.json`) and opens a link to it.

The 2017–2019 client wrote to IPFS through `ipfs-mini` and Infura, and published the site itself with `ipscend`. Infura has shut that API down, `js-ipfs` is no longer maintained, and `ipscend` required a global install. This repository is the same product on a current stack.

Last published copy of the old site: `QmbvveWddPW9ogjhPfByJybDAeE42eHna6a8bf6Qk2SF9B`.

## Stack

- [Bun](https://bun.sh) installs dependencies, runs tests, and runs the site-publish script.
- [Vite](https://vite.dev) and TypeScript build the static client. `Bun.build` is faster for a raw bundle, but this app needs a dev server, a relative `base` (GitHub Pages and an IPFS gateway do not serve the site from the domain root), and plain files from `public/`. That is what Vite is for.
- Writes go over HTTP, not through a browser IPFS node. A browser Helia node could compute a CID, but it would not keep the article available to anyone else: public gateways cannot see the bytes until some node on the network is holding them. Publishing therefore goes to an external pinning service.
- With no key, local mode computes a CID with the UnixFS `unixfs-v1-2025` profile (`ipfs-unixfs-importer`, the same library Helia uses) and stores the files in this browser's IndexedDB.
- Reads are plain HTTPS against several public gateways, one after another. On 21 October 2026 these responded and sent CORS headers:
  - `https://gateway.pinata.cloud/ipfs` serves both HTML and images.
  - `https://ipfs.filebase.io/ipfs` does the same.
  - `https://4everland.io/ipfs` is the fallback. It redirects to the CID subdomain.
  - `ipfs.io` and `dweb.link` already return 429 to programmatic clients (sunset 21 September 2026) and are not in the list. `w3s.link` (Storacha) no longer serves files: Storacha uploads stopped in April 2026 and the gateway stopped in May.

## Run

```bash
bun install
bun run dev
```

That opens `http://127.0.0.1:5173`. Write a title and some text, press Publish, and open the `#/p/<cid>` link.

Without a key the article stays in this browser. The article page says so. History lists what this device has published.

```bash
bun test
bun run build
bun run preview
```

## Pinning

The key is not committed. Enter it in Settings on the page (it stays in `localStorage`) or, for your own build, in `.env`. Variables prefixed with `VITE_` are baked into the built JavaScript and are visible to every visitor, so do not bake a token into a deploy that other people will open.

Copy `.env.example` to `.env` if you want defaults.

### Pinata

1. In [Pinata](https://app.pinata.cloud), create an API key and copy the JWT.
2. In Settings, choose Pinata. Endpoint: `https://api.pinata.cloud`. Paste the JWT.
3. Publish. The client sends the directory to `POST /pinning/pinFileToIPFS` (`cidVersion: 1`, `wrapWithDirectory: true`) and uses `IpfsHash` from the response. Pinata's docs still describe this method: v3 `POST /v3/files` does not accept folders.
4. The article opens at `#/p/<cid>` and at `https://gateway.pinata.cloud/ipfs/<cid>/`. A dedicated gateway can be set in Dedicated gateway. It is tried first.

### IPFS Pinning Service API

Any service that implements the [IPFS Pinning Service API](https://ipfs.github.io/pinning-services-api-spec/) works. Pinata's base URL is `https://api.pinata.cloud/psa`, with the same JWT.

The specification pins a CID that already exists. It does not accept the files. A Kubo HTTP API is also required (`http://127.0.0.1:5001` for a local `ipfs daemon`): the client calls `POST /api/v0/add`, then `POST <endpoint>/pins`. The node has to be reachable by the pinning service, or the request stays queued.

### Kubo only

Kubo mode adds the directory to the node you name. That node stores the files. Gateways can see them when the node is reachable on the network.

### Check it with a real key

1. Run `bun run dev`.
2. Settings → Pinata → JWT → Save. Under Publish the label should say Pinata, not This browser.
3. Publish a short article with an image.
4. Open the `gateway.pinata.cloud` link from the Pinned line in a private window that does not have this site's localStorage. The text and the image should load without the local cache.
5. If the first gateway does not answer, the client reads `article.json` and the images from the next gateway in the list above.

## Deploy

The old workflow installed Node 8 and ran `ipscend publish` against Infura. The build now goes to GitHub Pages, and to IPFS only when the repository secret `PINNING_TOKEN` is set (`PINNING_ENDPOINT` is optional and defaults to Pinata).

In the repository settings, set the Pages source to GitHub Actions. The secret is not part of the client bundle: the workflow uploads the built `dist/`.

```bash
PINNING_TOKEN=... bun run build
PINNING_TOKEN=... bun run pin:site
```

Versions of the site itself are the pin list in the provider's dashboard (name `ipfs-telegraph <date>`). `ipscend.json` used to keep that list. Article history lives in the browser, under History. Publishing again from Edit creates a new CID and records the previous one.

## What stayed

The empty page still has Title, Your name, and Your story, a Publish button, a dark toolbar for bold, italic, link, headings, and quote, and image and embed buttons on an empty line. A published page is the same width column, with a title, author, date, and text.

jQuery, Quill, `ipfs-mini`, CacheP2P, the service worker, video upload, and the unused calls to the telegra.ph API are gone. Images are files in the IPFS directory next to the article, not data URLs inside a single HTML page.
