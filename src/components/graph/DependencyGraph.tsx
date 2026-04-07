/**
 * Transitive Depth Graph — Renders a visual node graph showing
 * dependency chains using React Native SVG.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Line, Circle, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../hooks';
import type { UsageNode } from '../../types';

interface DependencyGraphProps {
  nodes: UsageNode[];
  packageName: string;
  width: number;
  height: number;
}

interface LayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
  depth: number;
  consumers: number;
}

interface LayoutEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function DependencyGraph({
  nodes,
  packageName,
  width,
  height,
}: DependencyGraphProps) {
  const theme = useTheme();

  const { layoutNodes, layoutEdges } = useMemo(() => {
    const filtered = nodes.filter((n) => n.packageName === packageName);
    if (filtered.length === 0) return { layoutNodes: [], layoutEdges: [] };

    // Group by depth
    const byDepth = new Map<number, UsageNode[]>();
    for (const node of filtered) {
      const arr = byDepth.get(node.depth) || [];
      arr.push(node);
      byDepth.set(node.depth, arr);
    }

    const maxDepth = Math.max(...byDepth.keys(), 0);
    const lNodes: LayoutNode[] = [];
    const lEdges: LayoutEdge[] = [];

    const paddingX = 60;
    const paddingY = 50;
    const usableWidth = width - paddingX * 2;
    const usableHeight = height - paddingY * 2;

    const nodePositions = new Map<string, { x: number; y: number }>();

    for (const [depth, depthNodes] of byDepth) {
      const y =
        maxDepth === 0
          ? usableHeight / 2 + paddingY
          : paddingY + (depth / maxDepth) * usableHeight;

      for (let i = 0; i < depthNodes.length; i++) {
        const node = depthNodes[i];
        const x =
          depthNodes.length === 1
            ? usableWidth / 2 + paddingX
            : paddingX + (i / (depthNodes.length - 1)) * usableWidth;

        nodePositions.set(node.id, { x, y });
        lNodes.push({
          id: node.id,
          label: node.exportName,
          x,
          y,
          depth: node.depth,
          consumers: node.consumers.length,
        });
      }
    }

    // Create edges for internal dependencies
    for (const node of filtered) {
      const fromPos = nodePositions.get(node.id);
      if (!fromPos) continue;

      for (const depId of node.internalDeps) {
        const toPos = nodePositions.get(depId);
        if (!toPos) continue;
        lEdges.push({
          from: node.id,
          to: depId,
          x1: fromPos.x,
          y1: fromPos.y,
          x2: toPos.x,
          y2: toPos.y,
        });
      }
    }

    return { layoutNodes: lNodes, layoutEdges: lEdges };
  }, [nodes, packageName, width, height]);

  if (layoutNodes.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={{ color: theme.colors.textTertiary }}>
          No usage graph data available
        </Text>
      </View>
    );
  }

  const nodeRadius = 20;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={width} height={height}>
        {/* Edges */}
        {layoutEdges.map((edge, i) => (
          <Line
            key={`edge-${i}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={theme.colors.border}
            strokeWidth={1.5}
            opacity={0.6}
          />
        ))}

        {/* Nodes */}
        {layoutNodes.map((node) => (
          <G key={node.id}>
            <Circle
              cx={node.x}
              cy={node.y}
              r={nodeRadius}
              fill={theme.colors.primary}
              opacity={0.15}
              stroke={theme.colors.primary}
              strokeWidth={2}
            />
            <SvgText
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize={10}
              fontWeight="600"
              fill={theme.colors.text}>
              {node.label.length > 8
                ? node.label.slice(0, 7) + '...'
                : node.label}
            </SvgText>
            <SvgText
              x={node.x}
              y={node.y + nodeRadius + 14}
              textAnchor="middle"
              fontSize={9}
              fill={theme.colors.textTertiary}>
              {node.consumers} ref{node.consumers !== 1 ? 's' : ''}
            </SvgText>
          </G>
        ))}
      </Svg>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
