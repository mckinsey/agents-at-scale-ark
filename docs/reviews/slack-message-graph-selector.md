📋 *Graph + Selector Hybrid Strategy - Discovery Complete*

Completed discovery on LegacyX's graph+selector hybrid. Findings:

*What LegacyX does:*
• AI selector chooses next member, but *constrained by graph edges*
• Skips AI call when only 1 valid transition (performance optimization)
• Requires exactly one leader agent (first speaker)
• Graph supports multiple targets per source (multiple edges with same `from`)

*Current ARK vs Hybrid:*
• `graph`: deterministic, one-to-one edges
• `selector`: AI from all members, no constraints  
• `graph-selector`: AI from graph-constrained options only

*Implementation:*
1. Add `graph-selector` strategy (keep existing separate)
2. Build `legalTransitions` map from edges (multiple edges with same `from` = multiple targets)
3. Selection: no previous → use `members[0]`; 0 legal → fallback; 1 legal → direct use (skip AI!); 2+ legal → filter to legal, then AI
4. Validation: require both `graph` and `selector` when using `graph-selector`

Full details: `docs/reviews/graph-selector-hybrid-review.md`

Ready to implement when approved 🚀

