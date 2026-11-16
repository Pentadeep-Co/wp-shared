/**
 * The Figma side: reads a frame through the REST API and reduces it to the
 * spec `pnpm verify` measures against.
 *
 * Only layers whose name ends in a class payload (`group/[.order__items]`) are
 * kept — the payload is the CSS contract, so it is also the selector that finds
 * the layer's element on the page. For each, the spec records what the design
 * *decides* rather than what its sample content happens to produce:
 *
 *   sizing      FIXED / HUG / FILL on each axis — a hug box is never compared
 *               by its drawn width, which is the sample text's
 *   box         the drawn size, used only for FIXED axes
 *   layout      auto-layout direction, padding, gap, wrap
 *   text        the one text style a leaf carries
 *   fill        a solid fill, `image`, or null (transparent)
 *   border      stroke width per side and colour
 */

const API = 'https://api.figma.com/v1';

type RGBA = [ number, number, number, number ];

interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: { r: number; g: number; b: number; a: number };
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  layoutWrap?: 'NO_WRAP' | 'WRAP';
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  primaryAxisAlignItems?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  individualStrokeWeights?: { top: number; right: number; bottom: number; left: number };
  opacity?: number;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    lineHeightPx?: number;
    lineHeightUnit?: string;
    letterSpacing?: number;
    textCase?: string;
  };
}

export interface SpecNode {
  id: string;
  name: string;
  selector: string;
  /** Payload selectors of the node's payload-carrying ancestors inside its root, outermost first. */
  chain: string[];
  /** The top-level pattern/part node this node belongs to. */
  root: string;
  /** Nearest payload-carrying ancestor's id, for the parent's layout. */
  parent: string | null;
  isText: boolean;
  childCount: number;
  box: { w: number; h: number };
  sizing: { h: 'FIXED' | 'HUG' | 'FILL'; v: 'FIXED' | 'HUG' | 'FILL' };
  layout: { mode: 'NONE' | 'HORIZONTAL' | 'VERTICAL'; padding: [ number, number, number, number ]; gap: number | null; wrap: boolean } | null;
  text: { family: string; size: number; weight: number; lineHeight: number | null; letterSpacing: number; upper: boolean; color: RGBA | null } | null;
  fill: RGBA | 'image' | null;
  border: { t: number; r: number; b: number; l: number; color: RGBA | null } | null;
}

export interface FrameSpec {
  frame: string;
  nodeId: string;
  width: number;
  pulledAt: string;
  fileVersion: string | null;
  /** Top-level pattern/part roots, by the name inside their brackets. */
  roots: Record<string, string>;
  nodes: SpecNode[];
}

/**
 * GET against the API, waiting out a rate limit: Figma answers 429 with a
 * Retry-After (seconds), and a pull of a whole frame grid meets it.
 */
async function get( url: string, token: string ): Promise<Response> {
  for ( let attempt = 0; ; attempt++ ) {
    const res = await fetch( url, { headers: { 'X-Figma-Token': token } } );
    if ( res.status !== 429 || attempt >= 6 ) {
      return res;
    }
    const wait = Math.min( 120, Number( res.headers.get( 'retry-after' ) ) || 15 * ( attempt + 1 ) );
    console.log( `  … Figma asked to wait ${ wait }s (rate limit)` );
    await new Promise( ( r ) => setTimeout( r, wait * 1000 ) );
  }
}

/** Several nodes in one request — a pull asks once per batch, not once per frame. */
export async function fetchNodes( fileKey: string, nodeIds: string[], token: string ): Promise<{ nodes: Record<string, FigmaNode | null>; version: string | null }> {
  const url = `${ API }/files/${ fileKey }/nodes?ids=${ encodeURIComponent( nodeIds.join( ',' ) ) }`;
  const res = await get( url, token );
  if ( ! res.ok ) {
    throw new Error( `Figma answered ${ res.status } for ${ nodeIds.join( ', ' ) }: ${ ( await res.text() ).slice( 0, 200 ) }` );
  }
  const body = await res.json() as { version?: string; nodes: Record<string, { document: FigmaNode } | null> };
  const nodes: Record<string, FigmaNode | null> = {};
  for ( const id of nodeIds ) {
    nodes[ id ] = body.nodes[ id ]?.document ?? null;
  }
  return { nodes, version: body.version ?? null };
}

/** PNG renders of nodes at 1×, for the side-by-side pairs. */
export async function renderNodes( fileKey: string, ids: string[], token: string ): Promise<Record<string, string | null>> {
  const url = `${ API }/images/${ fileKey }?ids=${ encodeURIComponent( ids.join( ',' ) ) }&format=png&scale=1`;
  const res = await get( url, token );
  if ( ! res.ok ) {
    throw new Error( `Figma image render answered ${ res.status }` );
  }
  return ( await res.json() as { images: Record<string, string | null> } ).images;
}

/** The class payload at the end of a layer name, as a selector: `[.a.b]` → `.a.b`. */
export function payload( name: string ): string | null {
  const last = name.split( '/' ).pop() ?? '';
  const match = /^\[((?:\.[\w-]+)+)\]$/.exec( last.trim() );
  return match ? match[ 1 ] as string : null;
}

/**
 * `pattern[Section - FAQ]/…` or `part[Header]/…` → `Section - FAQ` / `Header`;
 * `Overlay--drawer - Rental List--1920` → `Overlay--drawer - Rental List` (the
 * trailing width is a width, not a state — DESIGN-SOURCE.md).
 */
function rootName( name: string ): string | null {
  const trimmed = name.trim();
  const match = /^(?:pattern|part)\[([^\]]+)\]/.exec( trimmed );
  if ( match ) {
    return match[ 1 ] as string;
  }
  const overlay = /^(overlay--.+?)(?:--\d+)?$/i.exec( trimmed );
  return overlay ? overlay[ 1 ] as string : null;
}

function color( paint: FigmaPaint | undefined, layerOpacity = 1 ): RGBA | null {
  if ( ! paint?.color ) {
    return null;
  }
  const { r, g, b, a } = paint.color;
  return [ r * 255, g * 255, b * 255, a * ( paint.opacity ?? 1 ) * layerOpacity ];
}

function visiblePaints( paints: FigmaPaint[] | undefined ): FigmaPaint[] {
  return ( paints ?? [] ).filter( ( p ) => p.visible !== false && ( p.opacity ?? 1 ) > 0 );
}

/** The single text style a leaf carries — null when it has none, or several. */
function leafText( node: FigmaNode ): SpecNode['text'] {
  const texts: FigmaNode[] = [];
  const walk = ( n: FigmaNode, top: boolean ): void => {
    if ( n.visible === false ) {
      return;
    }
    if ( ! top && payload( n.name ) && n.type !== 'TEXT' ) {
      return; // another payload node owns its own text
    }
    if ( n.type === 'TEXT' ) {
      texts.push( n );
      return;
    }
    n.children?.forEach( ( c ) => walk( c, false ) );
  };
  walk( node, true );
  if ( texts.length === 0 ) {
    return null;
  }
  const styles = texts.map( ( t ) => t.style ?? {} );
  const first = styles[ 0 ] ?? {};
  const same = styles.every( ( s ) => s.fontSize === first.fontSize && s.fontWeight === first.fontWeight && s.fontFamily === first.fontFamily );
  if ( ! same || ! first.fontSize ) {
    return null;
  }
  const fill = visiblePaints( texts[ 0 ]?.fills )[ 0 ];
  return {
    family: first.fontFamily ?? '',
    size: first.fontSize,
    weight: first.fontWeight ?? 400,
    lineHeight: first.lineHeightUnit === 'INTRINSIC_%' ? null : ( first.lineHeightPx ?? null ),
    letterSpacing: first.letterSpacing ?? 0,
    upper: first.textCase === 'UPPER',
    color: fill?.type === 'SOLID' ? color( fill ) : null,
  };
}

/** Reduces a frame to its spec. */
export function toSpec( frameName: string, frame: FigmaNode, width: number, version: string | null ): FrameSpec {
  const nodes: SpecNode[] = [];
  const roots: Record<string, string> = {};

  const visit = ( node: FigmaNode, root: string | null, chain: string[], parent: string | null ): void => {
    if ( node.visible === false ) {
      return;
    }
    let top = root === null ? rootName( node.name ) : null;
    const thisRoot = top ? node.id : root;
    if ( top ) {
      /* A pattern used twice on one page is `Name`, then `Name #2`. */
      let key = top;
      for ( let n = 2; key in roots; n++ ) {
        key = `${ top } #${ n }`;
      }
      top = key;
      roots[ key ] = node.id;
    }
    const selector = payload( node.name );
    const pseudo = node.name.includes( '::' );
    let nextChain = chain;
    let nextParent = parent;

    if ( thisRoot && selector && ! pseudo ) {
      const fills = visiblePaints( node.fills );
      const strokes = visiblePaints( node.strokes );
      const stroke = strokes[ 0 ];
      const w = node.individualStrokeWeights;
      const sw = stroke ? ( node.strokeWeight ?? 0 ) : 0;
      const isText = node.type === 'TEXT';
      const mode = node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL' ? node.layoutMode : 'NONE';

      nodes.push( {
        id: node.id,
        name: node.name,
        selector,
        chain: top ? [] : [ ...chain ],
        root: thisRoot,
        parent,
        isText,
        childCount: ( node.children ?? [] ).filter( ( c ) => c.visible !== false ).length,
        box: { w: Math.round( node.absoluteBoundingBox?.width ?? 0 ), h: Math.round( node.absoluteBoundingBox?.height ?? 0 ) },
        sizing: { h: node.layoutSizingHorizontal ?? 'FIXED', v: node.layoutSizingVertical ?? 'FIXED' },
        layout: mode === 'NONE' ? null : {
          mode,
          padding: [ node.paddingTop ?? 0, node.paddingRight ?? 0, node.paddingBottom ?? 0, node.paddingLeft ?? 0 ],
          gap: node.primaryAxisAlignItems === 'SPACE_BETWEEN' ? null : ( node.itemSpacing ?? 0 ),
          wrap: node.layoutWrap === 'WRAP',
        },
        text: leafText( node ),
        fill: fills.some( ( f ) => f.type === 'IMAGE' ) ? 'image' : ( fills[ 0 ]?.type === 'SOLID' ? color( fills[ 0 ], node.opacity ?? 1 ) : null ),
        border: isText ? null : {
          t: stroke ? ( w ? w.top : sw ) : 0,
          r: stroke ? ( w ? w.right : sw ) : 0,
          b: stroke ? ( w ? w.bottom : sw ) : 0,
          l: stroke ? ( w ? w.left : sw ) : 0,
          color: stroke?.type === 'SOLID' ? color( stroke ) : null,
        },
      } );
      nextChain = top ? [] : [ ...chain, selector ];
      nextParent = node.id;
    }

    node.children?.forEach( ( child ) => visit( child, thisRoot, nextChain, nextParent ) );
  };

  /* An overlay frame is its own root; a page frame's roots are its children. */
  if ( rootName( frame.name ) ) {
    visit( frame, null, [], null );
  } else {
    frame.children?.forEach( ( child ) => visit( child, null, [], null ) );
  }

  return { frame: frameName, nodeId: frame.id, width, pulledAt: new Date().toISOString(), fileVersion: version, roots, nodes };
}
