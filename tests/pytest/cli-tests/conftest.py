def pytest_collection_modifyitems(items):
    provider_order = {"openai": 0, "anthropic": 1, "azure": 2}
    original_order = {item: i for i, item in enumerate(items)}

    def sort_key(item):
        node = item.nodeid
        bracket = node.rfind("[")
        if bracket != -1:
            provider = node[bracket + 1:].rstrip("]")
            return (provider_order.get(provider, 99), original_order[item])
        return (99, original_order[item])

    items.sort(key=sort_key)
