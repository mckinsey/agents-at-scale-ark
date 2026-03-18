# agent-team-protocol-messages

Step 6 in the staged protocol-native migration: introduce protocol-typed message interfaces for `TeamMember.Execute`, `Agent.executeLocally`, and `Agent.prepareMessages` so internal agent orchestration operates on A2A messages alongside the existing OpenAI-typed `Message` alias.
