package mcp

import (
	"github.com/prometheus/client_golang/prometheus"
)

var toolCallRetries = prometheus.NewCounterVec(
	prometheus.CounterOpts{
		Name: "ark_mcp_tool_call_retries_total",
		Help: "Retried MCP tool-call attempts by outcome.",
	},
	[]string{"result", "server"},
)

func init() {
	prometheus.MustRegister(toolCallRetries)
}
