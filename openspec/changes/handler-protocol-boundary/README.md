# handler-protocol-boundary

Step 8 in the staged protocol-native migration: invert the completions handler's conversion direction so `buildA2AResponse` operates on protocol messages natively, with OpenAI conversion relegated to a compatibility adapter at the provider boundary.
