
/* =================================================================
LAN mode: the dev server fronts the local WordPress site, so phones and
tablets on the home network can open it at http://<this-PC's-IP>:5173.

Local's nginx listens on 127.0.0.1 only and its hostname
(e.g. acme.local) does not resolve on a phone, so every request the dev
server does not answer itself is proxied to WordPress. WordPress keeps
believing it is served at its own hostname; on the way back the proxy swaps
that hostname — and the dev server's own `localhost:5173`, which the theme
enqueues — for whatever host the browser asked for. That covers generated
URLs and URLs saved in content alike, and nothing on the WordPress side
changes, so nothing here can ship.
==================================================================== */

const DEV_SERVER_HOST = 'localhost:5173';

/* Text that can carry a URL: HTML, CSS, JS, JSON (REST, the importmap),
   XML (feeds, sitemaps). Everything else streams through untouched. */
const TEXT = /^(text\/|application\/([\w.+-]*\+)?(json|javascript|xml)|application\/x-javascript)/i;

const escapeRe = ( value ) => value.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );

/**
 * Replaces `from` hosts with `to` wherever they appear as a URL authority:
 * `http://host`, protocol-relative `//host`, JSON-escaped `http:\/\/host`,
 * and URL-encoded `%2F%2Fhost` (redirect_to, oEmbed). The site is plain
 * HTTP on the network, so an `https:` scheme is downgraded with it.
 */
/** @param {string[]} from @param {string} to */
const hostSwapper = ( from, to ) => {
	const re = new RegExp(
		`(https?:)?(//|\\\\/\\\\/|%2F%2F)(${ from.map( escapeRe ).join( '|' ) })(?![\\w.-])`,
		'gi'
	);

	return ( /** @type {string} */ text ) =>
		text.replace( re, ( _match, scheme, separator ) =>
			`${ scheme ? 'http:' : '' }${ separator }${ to }`
		);
};

/**
 * @param {string} target The local WordPress URL (WP_PROXY_TARGET).
 * @returns {Record<string, import('vite').ProxyOptions>}
 */
export const wpProxy = ( target ) => {
	const targetHost = new URL( target ).host;

	return {
		/* Everything except the dev server's own paths: /@vite, /@fs, /@id,
		   /src/, /node_modules/ and its /__ internals. */
		'^/(?!@|src/|node_modules/|__)': {
			target,
			changeOrigin: true,
			selfHandleResponse: true,
			configure: ( proxy ) => {
				proxy.on( 'proxyReq', ( proxyReq, req ) => {
					const toTarget = hostSwapper( [ req.headers.host ?? '' ], targetHost );

					/* Uncompressed, so the body can be rewritten. */
					proxyReq.setHeader( 'accept-encoding', 'identity' );

					/* Requests carry the browser's host back in: map it to the
					   one WordPress knows. */
					proxyReq.path = toTarget( proxyReq.path );
					for ( const header of [ 'origin', 'referer' ] ) {
						const value = req.headers[ header ];
						if ( typeof value === 'string' ) {
							proxyReq.setHeader( header, toTarget( value ) );
						}
					}
				} );

				proxy.on( 'proxyRes', ( proxyRes, req, res ) => {
					const toBrowser = hostSwapper( [ targetHost, DEV_SERVER_HOST ], req.headers.host ?? DEV_SERVER_HOST );
					const headers = { ...proxyRes.headers };

					if ( typeof headers.location === 'string' ) {
						headers.location = toBrowser( headers.location );
					}

					if ( req.method === 'HEAD' || ! TEXT.test( String( headers[ 'content-type' ] ?? '' ) ) ) {
						res.writeHead( proxyRes.statusCode ?? 502, headers );
						proxyRes.pipe( res );
						return;
					}

					/** @type {Buffer[]} */
					const chunks = [];
					proxyRes.on( 'data', ( chunk ) => chunks.push( chunk ) );
					proxyRes.on( 'end', () => {
						const body = Buffer.from( toBrowser( Buffer.concat( chunks ).toString( 'utf8' ) ), 'utf8' );

						delete headers[ 'transfer-encoding' ];
						headers[ 'content-length' ] = String( body.length );

						res.writeHead( proxyRes.statusCode ?? 502, headers );
						res.end( body );
					} );
				} );
			},
		},
	};
};
