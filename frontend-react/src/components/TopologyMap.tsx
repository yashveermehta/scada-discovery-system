// TopologyMap.tsx - the main d3 force-directed graph visualization
// this took the longest to get right tbh - zoom-to-fit was painful
// 
// how it works:
// 1. d3 force simulation positions nodes automatically
// 2. we draw svg circles/text for each device
// 3. animated dots travel along links to show "data flow" 
// 4. after ~800ms we zoom the camera to fit all nodes nicely

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { DeviceType } from '../types';
import type { TopologyData, NetworkDevice } from '../types';

interface TopologyMapProps {
  data: TopologyData;
  onNodeClick: (device: NetworkDevice) => void;
}

const TopologyMap: React.FC<TopologyMapProps> = ({ data, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !data) return;

    // grab actual container size (not hardcoded)
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 500;

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();  // clear previous render

    if (data.nodes.length === 0) return;

    const defs = svg.append("defs");

    // subtle background grid - makes it look more "techy"
    const pattern = defs.append("pattern")
      .attr("id", "grid")
      .attr("width", 40)
      .attr("height", 40)
      .attr("patternUnits", "userSpaceOnUse");
    pattern.append("path")
      .attr("d", "M 40 0 L 0 0 0 40")
      .attr("fill", "none")
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 0.5);

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#grid)");

    // glowing gradients from Stitch design
    const addGradient = (id: string, c1: string, c2: string) => {
      const lg = defs.append("linearGradient").attr("id", id).attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "100%");
      lg.append("stop").attr("offset", "0%").attr("stop-color", c1).attr("stop-opacity", 1);
      lg.append("stop").attr("offset", "100%").attr("stop-color", c2).attr("stop-opacity", 0.3);
    };
    addGradient("grad-router", "#0d1a2a", "#5b7fa6");
    addGradient("grad-switch", "#0a1a12", "#4a8c6f");
    addGradient("grad-plc", "#1a1208", "#a07840");
    addGradient("grad-rtu", "#120f1a", "#7a6a9e");
    addGradient("grad-hmi", "#0d1a1e", "#3a8c9e");
    addGradient("grad-firewall", "#1a0f0a", "#b56230");
    addGradient("grad-unknown", "#101010", "#4c4c4c");
    addGradient("grad-rogue", "#180a0a", "#9c6060");

    // glow effect for nodes - gives them that neon look
    const glowFilter = defs.append("filter")
      .attr("id", "nodeGlow")
      .attr("x", "-100%").attr("y", "-100%")
      .attr("width", "300%").attr("height", "300%");
    glowFilter.append("feGaussianBlur")
      .attr("stdDeviation", "4")
      .attr("result", "coloredBlur");
    const merge = glowFilter.append("feMerge");
    merge.append("feMergeNode").attr("in", "coloredBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // marker for the pulse dots on links
    const pulseMarker = defs.append("marker")
      .attr("id", "dataPulse")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("refX", 3)
      .attr("refY", 3);
    pulseMarker.append("circle")
      .attr("cx", 3).attr("cy", 3).attr("r", 2)
      .attr("fill", "#60a5fa")
      .attr("opacity", 0.8);

    const g = svg.append("g");

    // zoom + pan behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom as any);

    // force simulation - the x/y forces keep nodes from drifting to edges
    const simulation = d3.forceSimulation<any>(data.nodes)
      .force("link", d3.forceLink<any, any>(data.links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50))
      .force("x", d3.forceX(width / 2).strength(0.08))
      .force("y", d3.forceY(height / 2).strength(0.08));

    // draw links as lines
    const linkGroup = g.append("g");

    const link = linkGroup.selectAll("line")
      .data(data.links)
      .join("line")
      .attr("stroke", (d: any) => d.protocol === 'EIGRP' ? "#3b82f6" : "#475569")
      .attr("stroke-width", (d: any) => d.type === 'physical' ? 2.5 : 1.5)
      .attr("stroke-dasharray", (d: any) => d.protocol === 'EIGRP' ? "0" : "6,4")
      .attr("stroke-opacity", 0.5);

    // animated pulse dots on each link (the "data flowing" effect)
    const pulseGroup = g.append("g").attr("class", "pulse-dots");

    data.links.forEach((_linkData: any, i: number) => {
      const dot = pulseGroup.append("circle")
        .attr("r", 3)
        .attr("fill", "#60a5fa")
        .attr("opacity", 0.7)
        .attr("filter", "url(#nodeGlow)");

      // recursive animation - dot travels from source to target, then restarts
      const animateDot = () => {
        const linkEl = link.nodes()[i];
        if (!linkEl) return;
        const x1 = +(linkEl as SVGLineElement).getAttribute("x1")!;
        const y1 = +(linkEl as SVGLineElement).getAttribute("y1")!;
        const x2 = +(linkEl as SVGLineElement).getAttribute("x2")!;
        const y2 = +(linkEl as SVGLineElement).getAttribute("y2")!;

        dot
          .attr("cx", x1).attr("cy", y1)
          .attr("opacity", 0)
          .transition()
          .delay(i * 400 + Math.random() * 2000)
          .duration(0)
          .attr("opacity", 0.7)
          .transition()
          .duration(2000 + Math.random() * 1000)
          .ease(d3.easeLinear)
          .attr("cx", x2).attr("cy", y2)
          .transition()
          .duration(200)
          .attr("opacity", 0)
          .on("end", animateDot);
      };

      // wait for the graph to settle before starting animations
      setTimeout(animateDot, 2000 + i * 300);
    });

    // draw nodes as groups (circle + label + icon)
    const node = g.append("g")
      .selectAll("g")
      .data(data.nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_event: any, d: any) => onNodeClick(d))
      .call(d3.drag<any, any>()
        .on("start", (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event: any, d: any) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on("end", (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));

    // outer glow ring (animated)
    node.append("circle")
      .attr("r", 28)
      .attr("fill", (d: any) => getNodeColor(d))
      .attr("fill-opacity", 0.2)
      .attr("stroke", (d: any) => getNodeColor(d))
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2")
      .attr("class", (d: any) => !d.isAuthorized ? "animate-pulse-rogue" : "animate-pulse-ring")
      .attr("filter", "url(#nodeGlow)");

    // main circle (gradient filled)
    node.append("circle")
      .attr("r", 18)
      .attr("fill", (d: any) => `url(#grad-${!d.isAuthorized ? 'rogue' : d.type.toLowerCase()})`)
      .attr("stroke", (d: any) => getNodeColor(d))
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 1);

    // dark pill behind the label 
    node.append("rect")
      .attr("y", 24)
      .attr("height", 14)
      .attr("rx", 2)
      .attr("fill", "#070a12")
      .attr("fill-opacity", 0.9)
      .attr("stroke", "#4d4637")
      .attr("stroke-width", 0.5)
      .attr("stroke-opacity", 0.3)
      .each(function (d: any) {
        const textLen = (d.name?.length || 6) * 6.5 + 10;
        d3.select(this).attr("width", textLen).attr("x", -textLen / 2);
      });

    // hostname
    node.append("text")
      .attr("dy", 35)
      .attr("text-anchor", "middle")
      .attr("fill", "#d0c5b2")
      .attr("font-size", "9px")
      .attr("font-weight", "600")
      .attr("font-family", "JetBrains Mono")
      .text((d: any) => d.name);

    // ip address below hostname
    node.append("text")
      .attr("dy", 48)
      .attr("text-anchor", "middle")
      .attr("fill", "#d0c5b2")
      .style("opacity", "0.4")
      .attr("font-size", "8px")
      .attr("font-family", "JetBrains Mono")
      .text((d: any) => d.ip);

    // type label inside the circle
    node.append("text")
      .attr("dy", 4)
      .attr("text-anchor", "middle")
      .attr("fill", (d: any) => !d.isAuthorized ? "#9c6060" : getNodeColor(d))
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .attr("font-family", "JetBrains Mono")
      .text((d: any) => getNodeLabel(d.type));

    // update positions on each simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // auto zoom-to-fit after the graph settles
    // tried using simulation.on("end") alone but it was unreliable
    // so using a timeout as primary + end event as backup
    const zoomToFit = () => {
      const nodes = data.nodes as any[];
      if (nodes.length === 0) return;

      const xVals = nodes.map((d: any) => d.x).filter(Boolean);
      const yVals = nodes.map((d: any) => d.y).filter(Boolean);
      if (xVals.length === 0) return;

      const xMin = Math.min(...xVals);
      const xMax = Math.max(...xVals);
      const yMin = Math.min(...yVals);
      const yMax = Math.max(...yVals);

      const graphW = xMax - xMin || 1;
      const graphH = yMax - yMin || 1;
      const graphCx = (xMin + xMax) / 2;
      const graphCy = (yMin + yMax) / 2;

      const pad = 100;
      const scale = Math.min(
        width / (graphW + pad * 2),
        height / (graphH + pad * 2),
        1.8  // dont zoom in too much
      );

      const tx = width / 2 - graphCx * scale;
      const ty = height / 2 - graphCy * scale;

      svg.transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .call(
          (zoom as any).transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
    };

    const fitTimer = setTimeout(zoomToFit, 800);
    simulation.on("end", zoomToFit);

    // cleanup on unmount
    return () => {
      clearTimeout(fitTimer);
      simulation.stop();
    };

  }, [data]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-transparent">
      <svg ref={svgRef} className="w-full h-full" />
      {/* Floating Legend from Stitch */}
      <div className="absolute top-6 right-6 bg-[#070a12]/80 backdrop-blur-md p-4 border border-[var(--color-outline-variant)]/10 z-20 shadow-lg shadow-black/50">
        <div className="font-headline text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--color-primary)] mb-3">Node Legend</div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#5b7fa6] border border-[#5b7fa6]/50"></div>
            <span className="font-label text-[9px] uppercase tracking-tighter text-[var(--color-on-surface-variant)]">Router</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#4a8c6f] border border-[#4a8c6f]/50"></div>
            <span className="font-label text-[9px] uppercase tracking-tighter text-[var(--color-on-surface-variant)]">Switch</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#a07840] border border-[#a07840]/50"></div>
            <span className="font-label text-[9px] uppercase tracking-tighter text-[var(--color-on-surface-variant)]">PLC</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#7a6a9e] border border-[#7a6a9e]/50"></div>
            <span className="font-label text-[9px] uppercase tracking-tighter text-[var(--color-on-surface-variant)]">RTU</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#9c6060] border border-[#9c6060]/50 animate-pulse-rogue"></div>
            <span className="font-label text-[9px] uppercase tracking-tighter text-[var(--color-error)]">Anomalous / Rogue</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// color mapping per device type
function getNodeColor(d: any): string {
  if (!d.isAuthorized) return "#ef4444";  // red = unauthorized
  switch (d.type) {
    case DeviceType.ROUTER: return "#3b82f6";
    case DeviceType.SWITCH: return "#10b981";
    case DeviceType.PLC: return "#f59e0b";
    case DeviceType.RTU: return "#8b5cf6";
    case DeviceType.FIREWALL: return "#f97316";
    case DeviceType.HMI: return "#06b6d4";
    default: return "#64748b";  // grey for unknown
  }
}

// short label that goes inside the circle
function getNodeLabel(type: string): string {
  switch (type) {
    case DeviceType.ROUTER: return "R";
    case DeviceType.SWITCH: return "SW";
    case DeviceType.PLC: return "PLC";
    case DeviceType.RTU: return "RTU";
    case DeviceType.HMI: return "HMI";
    case DeviceType.FIREWALL: return "FW";
    default: return "?";
  }
}

export default TopologyMap;
