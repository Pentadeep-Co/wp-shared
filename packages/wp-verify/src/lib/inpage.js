/*
 * Browser-side half of `pnpm verify`. Plain JavaScript, read as text and
 * evaluated in the page, so nothing a TypeScript compiler injects (esbuild's
 * `__name` helper, for one) can reach a page that has never heard of it.
 *
 * Installs `window.__verify` with two jobs:
 *   rules(prefix)       the invariants every page owes, at the current width
 *   measure(nodes, map) a pulled Figma spec against the live DOM
 */
( function () {
	if ( window.__verify ) {
		return;
	}

	var PX = 1; // tolerance for every length, in CSS px

	function visible( el ) {
		if ( ! el || ! el.getClientRects().length ) {
			return false;
		}
		var cs = getComputedStyle( el );
		return cs.visibility !== 'hidden' && cs.display !== 'none' && Number( cs.opacity ) > 0;
	}

	function describe( el ) {
		if ( ! el || ! el.tagName ) {
			return '?';
		}
		var cls = Array.prototype.slice.call( el.classList, 0, 3 ).join( '.' );
		return el.tagName.toLowerCase() + ( el.id ? '#' + el.id : '' ) + ( cls ? '.' + cls : '' );
	}

	/* ------------------------------------------------------------------
	   Invariants
	   ------------------------------------------------------------------ */

	function clipsX( el ) {
		for ( var p = el.parentElement; p && p !== document.body; p = p.parentElement ) {
			var o = getComputedStyle( p ).overflowX;
			if ( o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip' ) {
				return true;
			}
		}
		return false;
	}

	function overflow() {
		var vw = document.documentElement.clientWidth;
		var out = [];
		if ( document.documentElement.scrollWidth > vw + PX ) {
			out.push( 'the page scrolls sideways: ' + document.documentElement.scrollWidth + ' wide in a ' + vw + ' window' );
		}
		var all = document.body.querySelectorAll( '*' );
		var hits = [];
		for ( var i = 0; i < all.length; i++ ) {
			var el = all[ i ];
			if ( ! visible( el ) || getComputedStyle( el ).position === 'fixed' ) {
				continue;
			}
			var r = el.getBoundingClientRect();
			if ( ( r.right > vw + PX || r.left < -PX ) && r.width > 0 && ! clipsX( el ) ) {
				hits.push( describe( el ) + ' spans ' + Math.round( r.left ) + '…' + Math.round( r.right ) );
			}
		}
		/* No element sticks out, yet the page scrolls: a pseudo-element does. Hide
		   children one at a time to find the deepest box whose hiding stops it. */
		if ( out.length && ! hits.length ) {
			var width = function () {
				return document.documentElement.scrollWidth;
			};
			var at = document.body;
			var found = null;
			for ( var depth = 0; depth < 25; depth++ ) {
				var next = null;
				for ( var c = 0; c < at.children.length; c++ ) {
					var child = at.children[ c ];
					var before = width();
					var saved = child.style.display;
					child.style.display = 'none';
					var after = width();
					child.style.display = saved;
					if ( after < before ) {
						next = child;
						break;
					}
				}
				if ( ! next ) break;
				found = next;
				at = next;
			}
			if ( found ) {
				hits.push( 'caused inside ' + describe( found ) + ' — no element of it overflows, so look at its ::before / ::after' );
			}
		}
		/* The outermost offenders say the most; their children follow them out. */
		return out.concat( hits.slice( 0, 5 ) );
	}

	/* Every rule the page can read, plus `external` — the text of sheets from
	   another origin (a dev server), which the runner fetched itself. */
	function sheetsText( external ) {
		var text = ( external || [] ).slice();
		for ( var i = 0; i < document.styleSheets.length; i++ ) {
			var rules;
			try {
				rules = document.styleSheets[ i ].cssRules;
			} catch ( e ) {
				continue; // cross-origin
			}
			for ( var j = 0; j < rules.length; j++ ) {
				text.push( rules[ j ].cssText );
			}
		}
		var inline = document.querySelectorAll( '[style]' );
		for ( var k = 0; k < inline.length; k++ ) {
			text.push( inline[ k ].getAttribute( 'style' ) );
		}
		return text.join( '\n' );
	}

	/* Every style rule, nested ones resolved to a full selector, from the
	   readable sheets and the fetched text of the unreadable ones. */
	function parsedRules( external ) {
		var out = [];
		function walk( list, parent ) {
			for ( var i = 0; i < list.length; i++ ) {
				var rule = list[ i ];
				if ( rule.selectorText !== undefined ) {
					var sel = rule.selectorText.split( ',' ).map( function ( part ) {
						part = part.trim();
						if ( ! parent ) return part;
						return part.indexOf( '&' ) >= 0 ? part.replace( /&/g, ':is(' + parent + ')' ) : ':is(' + parent + ') ' + part;
					} ).join( ', ' );
					out.push( { selector: sel, text: rule.style ? rule.style.cssText : '' } );
					if ( rule.cssRules ) walk( rule.cssRules, sel );
				} else if ( rule.cssRules ) {
					walk( rule.cssRules, parent ); // @media, @supports, @layer
				}
			}
		}
		for ( var i = 0; i < document.styleSheets.length; i++ ) {
			try {
				walk( document.styleSheets[ i ].cssRules, '' );
			} catch ( e ) { /* cross-origin: covered by `external` */ }
		}
		( external || [] ).forEach( function ( text ) {
			try {
				var sheet = new CSSStyleSheet();
				sheet.replaceSync( text );
				walk( sheet.cssRules, '' );
			} catch ( e ) { /* unparseable: nothing to add */ }
		} );
		return out;
	}

	/* A var() of the theme's prefix that nothing declares, and a root token
	   that resolves to nothing — the two ways a declaration is silently
	   dropped. */
	function customProperties( prefix, external ) {
		var text = sheetsText( external );
		var esc = prefix.replace( /[-]/g, '\\-' );
		var declared = {};
		var decl = new RegExp( '(' + esc + '[\\w-]+)\\s*:', 'g' );
		var m;
		while ( ( m = decl.exec( text ) ) ) {
			declared[ m[ 1 ] ] = true;
		}
		var missing = {};
		var use = new RegExp( 'var\\(\\s*(' + esc + '[\\w-]+)\\s*(,)?', 'g' );
		while ( ( m = use.exec( text ) ) ) {
			if ( ! declared[ m[ 1 ] ] && ! m[ 2 ] ) {
				missing[ m[ 1 ] ] = true;
			}
		}
		/* Undeclared in any sheet is normal for a value a script sets (the logo
		   marquee's cell width). It is a fault only where an element on this
		   page is styled by a rule that uses it and it resolves to nothing. */
		var names = Object.keys( missing );
		var out = [];
		if ( names.length ) {
			var styleRules = parsedRules( external );
			names.forEach( function ( name ) {
				var hit = null;
				styleRules.some( function ( rule ) {
					if ( rule.text.indexOf( name ) < 0 ) return false;
					var els;
					try {
						els = document.querySelectorAll( rule.selector );
					} catch ( e ) {
						return false;
					}
					for ( var i = 0; i < els.length && ! hit; i++ ) {
						if ( visible( els[ i ] ) && getComputedStyle( els[ i ] ).getPropertyValue( name ).trim() === '' ) {
							hit = describe( els[ i ] );
						}
					}
					return !! hit;
				} );
				if ( hit ) {
					out.push( name + ' is never declared, and ' + hit + ' uses it' );
				}
			} );
		}
		var root = getComputedStyle( document.documentElement );
		Object.keys( declared ).forEach( function ( name ) {
			if ( new RegExp( ':root[^{]*\\{[^}]*' + name.replace( /[-]/g, '\\-' ) + '\\s*:' ).test( text ) && root.getPropertyValue( name ).trim() === '' ) {
				out.push( name + ' is declared on :root but resolves to nothing' );
			}
		} );
		return { count: Object.keys( declared ).length, problems: out };
	}

	function accessibleName( el ) {
		if ( el.getAttribute( 'aria-label' ) && el.getAttribute( 'aria-label' ).trim() ) {
			return true;
		}
		var by = el.getAttribute( 'aria-labelledby' );
		if ( by && by.split( /\s+/ ).some( function ( id ) {
			var t = document.getElementById( id );
			return t && t.textContent.trim();
		} ) ) {
			return true;
		}
		if ( el.getAttribute( 'title' ) && el.getAttribute( 'title' ).trim() ) {
			return true;
		}
		if ( el.textContent.trim() ) {
			return true;
		}
		var imgs = el.querySelectorAll( 'img[alt], svg[aria-label]' );
		for ( var i = 0; i < imgs.length; i++ ) {
			if ( ( imgs[ i ].getAttribute( 'alt' ) || imgs[ i ].getAttribute( 'aria-label' ) || '' ).trim() ) {
				return true;
			}
		}
		if ( el.id ) {
			var label = document.querySelector( 'label[for="' + CSS.escape( el.id ) + '"]' );
			if ( label && label.textContent.trim() ) {
				return true;
			}
		}
		var wrap = el.closest( 'label' );
		return !! ( wrap && wrap.textContent.trim() );
	}

	function a11y() {
		var out = [];
		var controls = document.querySelectorAll( 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea' );
		for ( var i = 0; i < controls.length; i++ ) {
			var el = controls[ i ];
			if ( visible( el ) && ! accessibleName( el ) && ! el.closest( '[aria-hidden="true"]' ) ) {
				out.push( describe( el ) + ' has no accessible name' );
			}
		}
		var imgs = document.querySelectorAll( 'img' );
		for ( var j = 0; j < imgs.length; j++ ) {
			if ( ! imgs[ j ].hasAttribute( 'alt' ) && visible( imgs[ j ] ) ) {
				out.push( describe( imgs[ j ] ) + ' (' + ( imgs[ j ].getAttribute( 'src' ) || '' ).split( '/' ).pop() + ') has no alt attribute' );
			}
		}
		var seen = {};
		var ids = document.querySelectorAll( '[id]' );
		for ( var k = 0; k < ids.length; k++ ) {
			var id = ids[ k ].id;
			if ( ids[ k ].closest( 'template' ) ) {
				continue;
			}
			seen[ id ] = ( seen[ id ] || 0 ) + 1;
		}
		Object.keys( seen ).forEach( function ( id ) {
			if ( seen[ id ] > 1 ) {
				out.push( 'id "' + id + '" is used ' + seen[ id ] + ' times' );
			}
		} );
		return out.slice( 0, 15 );
	}

	/* Hrefs of the sheets this page cannot read (cross-origin), for the runner. */
	function unreadableSheets() {
		var out = [];
		for ( var i = 0; i < document.styleSheets.length; i++ ) {
			var sheet = document.styleSheets[ i ];
			try {
				sheet.cssRules; // eslint-disable-line no-unused-expressions
			} catch ( e ) {
				if ( sheet.href ) out.push( sheet.href );
			}
		}
		return out;
	}

	function rules( prefix, external ) {
		var props = customProperties( prefix, external );
		return {
			styled: props.count > 0,
			overflow: overflow(),
			customProperties: props.problems,
			a11y: a11y(),
		};
	}

	/* ------------------------------------------------------------------
	   Measurement against a pulled spec
	   ------------------------------------------------------------------ */

	function rgba( str ) {
		var m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/.exec( str || '' );
		if ( ! m ) {
			return null;
		}
		var a = m[ 4 ] === undefined ? 1 : ( m[ 4 ].slice( -1 ) === '%' ? parseFloat( m[ 4 ] ) / 100 : parseFloat( m[ 4 ] ) );
		return [ +m[ 1 ], +m[ 2 ], +m[ 3 ], a ];
	}

	function hex( c ) {
		if ( ! c ) {
			return 'none';
		}
		var h = '#' + c.slice( 0, 3 ).map( function ( v ) {
			return ( '0' + Math.round( v ).toString( 16 ) ).slice( -2 );
		} ).join( '' );
		return c[ 3 ] < 1 ? h + ' @' + Math.round( c[ 3 ] * 100 ) + '%' : h;
	}

	function sameColor( a, b ) {
		if ( ! a || ! b ) {
			return ( ! a || a[ 3 ] < 0.02 ) && ( ! b || b[ 3 ] < 0.02 );
		}
		if ( a[ 3 ] < 0.02 && b[ 3 ] < 0.02 ) {
			return true;
		}
		return Math.abs( a[ 0 ] - b[ 0 ] ) <= 3 && Math.abs( a[ 1 ] - b[ 1 ] ) <= 3 && Math.abs( a[ 2 ] - b[ 2 ] ) <= 3 && Math.abs( a[ 3 ] - b[ 3 ] ) <= 0.03;
	}

	function near( a, b, tol ) {
		return Math.abs( a - b ) <= ( tol === undefined ? PX : tol );
	}

	function maxContentWidth( el ) {
		var saved = el.style.cssText;
		el.style.setProperty( 'width', 'max-content', 'important' );
		el.style.setProperty( 'min-width', '0', 'important' );
		el.style.setProperty( 'flex', 'none', 'important' );
		var w = el.getBoundingClientRect().width;
		el.style.cssText = saved;
		return w;
	}

	function contentBox( el ) {
		var r = el.getBoundingClientRect();
		var cs = getComputedStyle( el );
		return {
			w: r.width - parseFloat( cs.paddingLeft ) - parseFloat( cs.paddingRight ) - parseFloat( cs.borderLeftWidth ) - parseFloat( cs.borderRightWidth ),
			h: r.height - parseFloat( cs.paddingTop ) - parseFloat( cs.paddingBottom ) - parseFloat( cs.borderTopWidth ) - parseFloat( cs.borderBottomWidth ),
		};
	}

	/* Borders, counting an inset box-shadow rule (`inset 1px 0 0 0 c`) as the
	   side it draws — the theme's way of ruling a box without moving it. */
	function sides( el ) {
		var cs = getComputedStyle( el );
		var out = {
			t: { w: parseFloat( cs.borderTopWidth ), c: rgba( cs.borderTopColor ) },
			r: { w: parseFloat( cs.borderRightWidth ), c: rgba( cs.borderRightColor ) },
			b: { w: parseFloat( cs.borderBottomWidth ), c: rgba( cs.borderBottomColor ) },
			l: { w: parseFloat( cs.borderLeftWidth ), c: rgba( cs.borderLeftColor ) },
		};
		[ 't', 'r', 'b', 'l' ].forEach( function ( k ) {
			if ( cs[ { t: 'borderTopStyle', r: 'borderRightStyle', b: 'borderBottomStyle', l: 'borderLeftStyle' }[ k ] ] === 'none' ) {
				out[ k ].w = 0;
			}
		} );
		( cs.boxShadow || '' ).split( /,(?![^(]*\))/ ).forEach( function ( part ) {
			if ( part.indexOf( 'inset' ) < 0 ) {
				return;
			}
			var color = rgba( part );
			var nums = part.replace( /rgba?\([^)]*\)/, '' ).match( /-?[\d.]+px|\b0\b/g ) || [];
			var x = parseFloat( nums[ 0 ] || 0 );
			var y = parseFloat( nums[ 1 ] || 0 );
			if ( x > 0 ) out.l = { w: x, c: color };
			if ( x < 0 ) out.r = { w: -x, c: color };
			if ( y > 0 ) out.t = { w: y, c: color };
			if ( y < 0 ) out.b = { w: -y, c: color };
		} );
		return out;
	}

	function visibleChildren( el ) {
		return Array.prototype.filter.call( el.children, function ( c ) {
			var r = c.getBoundingClientRect();
			return visible( c ) && r.width > 0 && r.height > 0 && getComputedStyle( c ).position !== 'absolute';
		} );
	}

	/**
	 * Finds each spec node's element and compares it. `nodes` is the pulled
	 * spec, in design order; `roots` maps a pattern-root node id to the CSS
	 * selector of its element on the page.
	 */
	/* The design's spelling of a payload → the theme's (recorded flags). */
	function alias( selector, aliases ) {
		if ( aliases.selectors && aliases.selectors[ selector ] ) {
			return aliases.selectors[ selector ];
		}
		return selector.replace( /\.([\w-]+)/g, function ( all, cls ) {
			return aliases.classes && aliases.classes[ cls ] ? '.' + aliases.classes[ cls ] : all;
		} );
	}

	function measure( nodes, roots, aliases ) {
		aliases = aliases || {};
		var results = [];
		var byId = {};
		nodes.forEach( function ( n ) {
			byId[ n.id ] = n;
		} );
		var used = {};
		var reportedRoot = {};
		/* Each layer's payload children, as the theme spells them — their text is theirs. */
		var kidsOf = {};
		nodes.forEach( function ( n ) {
			if ( n.parent ) {
				( kidsOf[ n.parent ] = kidsOf[ n.parent ] || [] ).push( alias( n.selector, aliases ) );
			}
		} );
		/* A hug is the element's own when no payload child fills it or is drawn
		   fixed and wide: a box hugging fixed 1200 children is not expected to
		   hug in a fluid build. */
		nodes.forEach( function ( n ) {
			n.hugsOwn = ! nodes.some( function ( c ) {
				return c.parent === n.id && ( c.sizing.h === 'FILL' || ( c.sizing.h === 'FIXED' && c.box.w >= n.box.w * 0.5 ) );
			} );
		} );

		nodes.forEach( function ( node ) {
			var rootSel = roots[ node.root ];
			var row = { id: node.id, name: node.name, root: node.root, problems: [], checked: 0 };
			results.push( row );
			if ( ! rootSel ) {
				row.skipped = 'its section is not on this page';
				return;
			}
			/* `selector|n` is the n-th match (0-based) — for a pattern used twice. */
			/* `?selector`: drawn by the design, rendered only when the content has
			   it (a fifth category list) — skipped when absent. */
			var optional = rootSel.charAt( 0 ) === '?';
			var bare = optional ? rootSel.slice( 1 ) : rootSel;
			var bar = bare.lastIndexOf( '|' );
			var numbered = bar > 0 && /^\d+$/.test( bare.slice( bar + 1 ) );
			var nth = numbered ? +bare.slice( bar + 1 ) : 0;
			var rootEl = Array.prototype.filter.call( document.querySelectorAll( numbered ? bare.slice( 0, bar ) : bare ), visible )[ nth ] || null;
			if ( ! rootEl ) {
				/* A missing section is one problem, reported once — not once per layer. */
				if ( optional ) {
					row.skipped = 'its section is not rendered for this content';
				} else if ( ! reportedRoot[ node.root ] ) {
					reportedRoot[ node.root ] = true;
					row.problems.push( { prop: 'present', want: bare, got: 'missing' } );
				} else {
					row.skipped = 'its section is missing (reported once)';
				}
				return;
			}

			var el = null;
			if ( node.id === node.root ) {
				el = rootEl;
			} else {
				/* The fullest ancestor chain that still matches, then fewer. */
				for ( var drop = 0; drop <= node.chain.length && ! el; drop++ ) {
					var sel = node.chain.slice( drop ).concat( node.selector ).map( function ( part ) {
						return alias( part, aliases );
					} ).join( ' ' );
					var found;
					try {
						var all = Array.prototype.slice.call( rootEl.querySelectorAll( sel ) );
						found = all.filter( visible );
						/* Built but not shown at rest (an animation's start state):
						   present, and not measured. */
						if ( ! found.length && all.length ) {
							el = all[ 0 ];
							row.element = describe( el );
							row.skipped = 'present, not visible at rest';
							break;
						}
					} catch ( e ) {
						found = [];
					}
					if ( found.length ) {
						var key = node.root + '|' + sel;
						var at = used[ key ] || 0;
						el = found[ Math.min( at, found.length - 1 ) ];
						used[ key ] = at + 1;
						/* Found only by dropping ancestors, among several candidates:
						   which one is "this" layer is a guess, and a guess compared
						   is noise. Present, not measured. */
						if ( drop > 0 && found.length > 1 && node.chain.length ) {
							row.skipped = 'present; several matches without its ancestors, so not measured';
						}
					}
				}
			}
			if ( ! el ) {
				row.problems.push( { prop: 'present', want: node.selector, got: 'missing' } );
				return;
			}
			row.element = describe( el );
			if ( row.skipped ) {
				return;
			}
			compare( node, el, byId[ node.parent ], row, kidsOf[ node.id ] || [] );
		} );
		return results;
	}

	function push( row, prop, want, got, ok ) {
		row.checked++;
		if ( ! ok ) {
			row.problems.push( { prop: prop, want: want, got: got } );
		}
	}

	/* The element whose own text the design's text style describes: the
	   element itself when it holds text directly, else the first visible
	   descendant that does — a container's inherited style is not its text's. */
	function textHolder( el, skip ) {
		var holds = function ( n ) {
			return Array.prototype.some.call( n.childNodes, function ( c ) {
				return c.nodeType === 3 && c.textContent.trim();
			} );
		};
		/* Text inside a child layer's element is that layer's, not this one's. */
		var owned = function ( n ) {
			return skip.some( function ( sel ) {
				try {
					var hit = n.closest( sel );
					return hit && hit !== el && el.contains( hit );
				} catch ( e ) {
					return false;
				}
			} );
		};
		if ( holds( el ) ) {
			return el;
		}
		var all = el.querySelectorAll( '*' );
		for ( var i = 0; i < all.length; i++ ) {
			if ( visible( all[ i ] ) && holds( all[ i ] ) && ! owned( all[ i ] ) ) {
				return all[ i ];
			}
		}
		/* No text of its own here (the build keeps it elsewhere): nothing to
		   compare — the container's inherited style is not its text's. */
		return null;
	}

	function compare( node, el, parent, row, kids ) {
		/* A core button's payload sits on its wrapper; its box, fill and type
		   are the link's inside. */
		if ( el.classList.contains( 'wp-block-button' ) && el.querySelector( ':scope > .wp-block-button__link' ) ) {
			el = el.querySelector( ':scope > .wp-block-button__link' );
		}
		var r = el.getBoundingClientRect();
		var cs = getComputedStyle( el );
		var parentLayout = parent && parent.layout ? parent.layout.mode : 'NONE';

		/* Width */
		/* Figma strokes take no layout space and CSS borders do: inside a ruled
		   parent, a drawn-full child is short by the parent's borders. */
		var pcs = el.parentElement ? getComputedStyle( el.parentElement ) : null;
		var ruled = pcs ? parseFloat( pcs.borderLeftWidth ) + parseFloat( pcs.borderRightWidth ) : 0;

		/* A box with no fill and no rule is invisible: its width is seen only
		   through its text, so hug versus fill cannot be told apart by eye
		   (a left-aligned eyebrow that hugs looks exactly like one that fills).
		   Its FIXED width still counts — that bounds where text wraps. */
		var drawn = !! node.fill || !! ( node.border && ( node.border.t || node.border.r || node.border.b || node.border.l ) );
		/* …and invisible on the page too: no background, no rule. */
		var bs = sides( el );
		var builtDrawn = ( rgba( cs.backgroundColor ) || [ 0, 0, 0, 0 ] )[ 3 ] > 0.02 || bs.t.w || bs.r.w || bs.b.w || bs.l.w;
		var bare = ! drawn && ! builtDrawn && ( node.text || node.childCount <= 1 || node.isText );
		/* The same content box with the inset moved inside: the design pads the
		   frame, the build pads the box — the text sits in the same place. */
		var inner = contentBox( el );
		var insetInside = node.layout && node.layout.padding.every( function ( v ) {
			return v === 0;
		} ) && near( inner.w, node.box.w, PX + ruled );

		if ( node.sizing.h === 'FIXED' && ! node.isText ) {
			push( row, 'width', node.box.w, Math.round( r.width ), near( r.width, node.box.w, PX + ruled ) || insetInside );
		} else if ( bare ) {
			/* not visible — see above */
		} else if ( node.sizing.h === 'HUG' && ! node.isText && node.hugsOwn ) {
			var mc = maxContentWidth( el );
			push( row, 'width (hug content)', Math.round( mc ), Math.round( r.width ), near( r.width, mc, 2 ) );
		} else if ( node.sizing.h === 'FILL' && el.parentElement ) {
			if ( parentLayout === 'VERTICAL' ) {
				var pc = contentBox( el.parentElement ).w;
				push( row, 'width (fill parent)', Math.round( pc ), Math.round( r.width ), near( r.width, pc, 2 ) );
			} else if ( parentLayout === 'HORIZONTAL' ) {
				/* Filling is growing past its own content: flex-grow, a grid track, or a set width that does. */
				var grows = parseFloat( cs.flexGrow ) > 0 || ( pcs && pcs.display.indexOf( 'grid' ) >= 0 ) || r.width > maxContentWidth( el ) + 2;
				push( row, 'width (fill the row)', 'grows', grows ? 'grows' : 'content width', grows );
			}
		}

		/* Height — content-driven heights are never compared. */
		if ( node.sizing.v === 'FIXED' && ! node.isText ) {
			push( row, 'height', node.box.h, Math.round( r.height ), near( r.height, node.box.h ) );
		} else if ( node.sizing.v === 'FILL' && parentLayout === 'HORIZONTAL' && el.parentElement ) {
			var ph = contentBox( el.parentElement ).h;
			push( row, 'height (fill the row)', Math.round( ph ), Math.round( r.height ), near( r.height, ph, 2 ) );
		}

		/* Auto-layout: padding, direction, gap */
		if ( node.layout && node.layout.mode !== 'NONE' ) {
			var pad = [ cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft ].map( parseFloat );
			var want = node.layout.padding;
			var padOk = pad.every( function ( v, i ) {
				return near( v, want[ i ] );
			} );
			/* The same box made another way — a fixed 47² with its icon centred,
			   where the design pads a 15 icon by 16 — is the same box. */
			var sameBox = node.sizing.h !== 'FILL' && node.sizing.v !== 'FILL' && node.childCount <= 1 &&
				near( r.width, node.box.w ) && near( r.height, node.box.h );
			push( row, 'padding', want.join( ' ' ), pad.map( Math.round ).join( ' ' ), padOk || sameBox || insetInside );

			var kids = visibleChildren( el );
			if ( kids.length >= 2 && node.childCount >= 2 ) {
				var a = kids[ 0 ].getBoundingClientRect();
				var b = kids[ 1 ].getBoundingClientRect();
				var horizontal = b.left >= a.right - PX && b.top < a.bottom;
				var got = horizontal ? 'HORIZONTAL' : ( b.top >= a.bottom - PX ? 'VERTICAL' : 'overlapping' );
				push( row, 'direction', node.layout.mode, got, got === node.layout.mode || ( node.layout.wrap && got !== 'overlapping' ) );
				if ( got === node.layout.mode && node.layout.gap !== null ) {
					/* A flex or grid box states its gap; distance between children
					   would count space-between's slack as gap. */
					var stated = cs.display.indexOf( 'flex' ) >= 0 || cs.display.indexOf( 'grid' ) >= 0;
					var gap = stated
						? parseFloat( node.layout.mode === 'HORIZONTAL' ? cs.columnGap : cs.rowGap ) || 0
						: ( node.layout.mode === 'HORIZONTAL' ? b.left - a.right : b.top - a.bottom );
					push( row, 'gap', node.layout.gap, Math.round( gap ), near( gap, node.layout.gap ) );
				}
			}
		}

		/* Type */
		var holder = node.text ? textHolder( el, kids ) : null;
		if ( node.text && holder ) {
			var t = node.text;
			cs = getComputedStyle( holder );
			push( row, 'font-size', t.size, parseFloat( cs.fontSize ), near( parseFloat( cs.fontSize ), t.size, 0.5 ) );
			push( row, 'font-weight', t.weight, +cs.fontWeight, Math.abs( +cs.fontWeight - t.weight ) < 50 );
			var fam = cs.fontFamily.split( ',' )[ 0 ].replace( /["']/g, '' ).trim();
			push( row, 'font-family', t.family, fam, fam.toLowerCase().indexOf( t.family.toLowerCase() ) === 0 );
			if ( t.lineHeight !== null && cs.lineHeight !== 'normal' ) {
				push( row, 'line-height', t.lineHeight, Math.round( parseFloat( cs.lineHeight ) * 10 ) / 10, near( parseFloat( cs.lineHeight ), t.lineHeight, 1 ) );
			}
			var ls = cs.letterSpacing === 'normal' ? 0 : parseFloat( cs.letterSpacing );
			push( row, 'letter-spacing', t.letterSpacing, Math.round( ls * 100 ) / 100, near( ls, t.letterSpacing, 0.15 ) );
			if ( t.upper !== undefined ) {
				var up = cs.textTransform === 'uppercase';
				push( row, 'text-transform', t.upper ? 'uppercase' : 'none', up ? 'uppercase' : 'none', up === t.upper || ! t.upper );
			}
			if ( t.color ) {
				var c = rgba( cs.color );
				push( row, 'color', hex( t.color ), hex( c ), sameColor( c, t.color ) );
			}
		}

		cs = getComputedStyle( el );

		/* Surface */
		if ( ! node.isText && node.fill !== 'image' ) {
			var bg = rgba( cs.backgroundColor );
			push( row, 'background', hex( node.fill ), hex( bg ), sameColor( bg, node.fill ) );
		}

		if ( ! node.isText && node.border ) {
			var s = sides( el );
			[ 't', 'r', 'b', 'l' ].forEach( function ( k ) {
				var w = node.border[ k ];
				var label = { t: 'top', r: 'right', b: 'bottom', l: 'left' }[ k ];
				push( row, 'border-' + label, w ? w + 'px ' + hex( node.border.color ) : 'none', s[ k ].w ? s[ k ].w + 'px ' + hex( s[ k ].c ) : 'none',
					w ? near( s[ k ].w, w, 0.5 ) && sameColor( s[ k ].c, node.border.color ) : s[ k ].w < 0.5 );
			} );
		}
	}

	window.__verify = { rules: rules, measure: measure, unreadableSheets: unreadableSheets };
} )();
