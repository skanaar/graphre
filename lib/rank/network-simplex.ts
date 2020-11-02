import _ from '../lodash';
import { feasibleTree } from "./feasible-tree";
import { slack } from "./util";
import { longestPath } from "./util";
import { alg, Edge, Graph } from 'graphlib';
import { simplify } from "../util";
import { DagreGraph, GraphNode } from '../types';

type SimplexNode = GraphNode & { low: number, lim: number, parent: string, cutvalue: number };
type SimplexEdge = { cutvalue: number };
export type SimplexTree = Graph<unknown, Partial<SimplexNode>, Partial<SimplexEdge>>;

var preorder = alg.preorder;
var postorder = alg.postorder;

// Expose some internals for testing purposes
networkSimplex.initLowLimValues = initLowLimValues;
networkSimplex.initCutValues = initCutValues;
networkSimplex.calcCutValue = calcCutValue;
networkSimplex.leaveEdge = leaveEdge;
networkSimplex.enterEdge = enterEdge;
networkSimplex.exchangeEdges = exchangeEdges;

/*
 * The network simplex algorithm assigns ranks to each node in the input graph
 * and iteratively improves the ranking to reduce the length of edges.
 *
 * Preconditions:
 *
 *    1. The input graph must be a DAG.
 *    2. All nodes in the graph must have an object value.
 *    3. All edges in the graph must have "minlen" and "weight" attributes.
 *
 * Postconditions:
 *
 *    1. All nodes in the graph will have an assigned "rank" attribute that has
 *       been optimized by the network simplex algorithm. Ranks start at 0.
 *
 *
 * A rough sketch of the algorithm is as follows:
 *
 *    1. Assign initial ranks to each node. We use the longest path algorithm,
 *       which assigns ranks to the lowest position possible. In general this
 *       leads to very wide bottom ranks and unnecessarily long edges.
 *    2. Construct a feasible tight tree. A tight tree is one such that all
 *       edges in the tree have no slack (difference between length of edge
 *       and minlen for the edge). This by itself greatly improves the assigned
 *       rankings by shorting edges.
 *    3. Iteratively find edges that have negative cut values. Generally a
 *       negative cut value indicates that the edge could be removed and a new
 *       tree edge could be added to produce a more compact graph.
 *
 * Much of the algorithms here are derived from Gansner, et al., "A Technique
 * for Drawing Directed Graphs." The structure of the file roughly follows the
 * structure of the overall algorithm.
*/
export function networkSimplex(g: DagreGraph) {
  g = simplify(g);
  longestPath(g);
  var t = feasibleTree<unknown, SimplexNode, SimplexEdge>(g);
  initLowLimValues(t);
  initCutValues(t, g);

  var e, f;
  while ((e = leaveEdge(t))) {
    f = enterEdge(t, g, e);
    exchangeEdges(t, g, e, f);
  }
}

/*
 * Initializes cut values for all edges in the tree.
*/
function initCutValues(t: SimplexTree, g: DagreGraph) {
  var vs = postorder(t, t.nodes());
  vs = vs.slice(0, vs.length - 1);
  for (var v of vs) {
    assignCutValue(t, g, v);
  }
}

function assignCutValue(t: SimplexTree, g: DagreGraph, child: string) {
  var childLab = t.node(child);
  var parent = childLab.parent;
  t.edge(child, parent).cutvalue = calcCutValue(t, g, child);
}

/*
 * Given the tight tree, its graph, and a child in the graph calculate and
 * return the cut value for the edge between the child and its parent.
*/
function calcCutValue(t: SimplexTree, g: DagreGraph, child: string) {
  var childLab = t.node(child);
  var parent = childLab.parent;
  // True if the child is on the tail end of the edge in the directed graph
  var childIsTail = true;
  // The graph's view of the tree edge we're inspecting
  var graphEdge = g.edge(child, parent);
  // The accumulated cut value for the edge between this node and its parent
  var cutValue = 0;

  if (!graphEdge) {
    childIsTail = false;
    graphEdge = g.edge(parent, child);
  }

  cutValue = graphEdge.weight;

  for (var e of g.nodeEdges(child)) {
    var isOutEdge = e.v === child;
    var other = isOutEdge ? e.w : e.v;

    if (other !== parent) {
      var pointsToHead = isOutEdge === childIsTail;
      var otherWeight = g.edge(e).weight;

      cutValue += pointsToHead ? otherWeight : -otherWeight;
      if (isTreeEdge(t, child, other)) {
        var otherCutValue = t.edge(child, other).cutvalue;
        cutValue += pointsToHead ? -otherCutValue : otherCutValue;
      }
    }
  }

  return cutValue;
}

function initLowLimValues(tree: SimplexTree, root?: string) {
  if (arguments.length < 2) {
    root = tree.nodes()[0];
  }
  dfsAssignLowLim(tree, {}, 1, root);
}

function dfsAssignLowLim(tree: SimplexTree, visited: Record<string, boolean>, nextLim: number, v: string, parent?: string) {
  var low = nextLim;
  var label = tree.node(v);

  visited[v] = true;
  for (var w of tree.neighbors(v)) {
    if (!_.has(visited, w)) {
      nextLim = dfsAssignLowLim(tree, visited, nextLim, w, v);
    }
  }

  label.low = low;
  label.lim = nextLim++;
  if (parent) {
    label.parent = parent;
  } else {
    // TODO should be able to remove this when we incrementally update low lim
    delete label.parent;
  }

  return nextLim;
}

function leaveEdge(tree: SimplexTree) {
  for (var e of tree.edges()) {
    if (tree.edge(e).cutvalue < 0) {
      return e;
    }
  }
  return undefined;
}

function enterEdge(t: SimplexTree, g: DagreGraph, edge: Edge) {
  var v = edge.v;
  var w = edge.w;

  // For the rest of this function we assume that v is the tail and w is the
  // head, so if we don't have this edge in the graph we should flip it to
  // match the correct orientation.
  if (!g.hasEdge(v, w)) {
    v = edge.w;
    w = edge.v;
  }

  var vLabel = t.node(v);
  var wLabel = t.node(w);
  var tailLabel = vLabel;
  var flip = false;

  // If the root is in the tail of the edge then we need to flip the logic that
  // checks for the head and tail nodes in the candidates function below.
  if (vLabel.lim > wLabel.lim) {
    tailLabel = wLabel;
    flip = true;
  }

  var candidates = g.edges().filter(function(edge) {
    return flip === isDescendant(t, t.node(edge.v), tailLabel) &&
           flip !== isDescendant(t, t.node(edge.w), tailLabel);
  });

  return _.minBy(candidates, function(edge: Edge) { return slack(g, edge); });
}

function exchangeEdges(t: SimplexTree, g: DagreGraph, e: Edge, f: Edge) {
  var v = e.v;
  var w = e.w;
  t.removeEdge(v, w);
  t.setEdge(f.v, f.w, {});
  initLowLimValues(t);
  initCutValues(t, g);
  updateRanks(t, g);
}

function findRoot(t: SimplexTree, g: DagreGraph): string {
  for (var v of t.nodes()) if (!g.node(v).parent) return v;
  return undefined;
}

function updateRanks(t: SimplexTree, g: DagreGraph) {
  var root = findRoot(t, g);
  var vs = preorder(t, root);
  vs = vs.slice(1);
  for (var v of vs) {
    var parent = t.node(v).parent;
    var edge = g.edge(v, parent);
    var flipped = false;

    if (!edge) {
      edge = g.edge(parent, v);
      flipped = true;
    }

    g.node(v).rank = g.node(parent).rank + (flipped ? edge.minlen : -edge.minlen);
  }
}

/*
 * Returns true if the edge is in the tree.
*/
function isTreeEdge(tree: SimplexTree, u: string, v: string) {
  return tree.hasEdge(u, v);
}

/*
 * Returns true if the specified node is descendant of the root node per the
 * assigned low and lim attributes in the tree.
*/
function isDescendant(tree: unknown, vLabel: Partial<SimplexNode>, rootLabel: Partial<SimplexNode>) {
  return rootLabel.low <= vLabel.lim && vLabel.lim <= rootLabel.lim;
}