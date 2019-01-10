module.exports = function (RED) {
  var ws = require('ws')
  var ApolloClient = require('apollo-boost').ApolloClient;
  var WebSocketLink = require('apollo-link-ws').WebSocketLink;
  var InMemoryCache = require('apollo-cache-inmemory').InMemoryCache;
  var gql = require('graphql-tag')

  function GraphQLSubscriptionNode (config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.graphqlConfig = RED.nodes.getNode(config.graphql);

    if (!node.graphqlConfig) {
      this.error("invalid graphql config");
    }

    node.status({ fill: 'yellow', shape: 'ring', text: 'Disconnected' })
    const link = new WebSocketLink({
      uri: node.graphqlConfig.endpoint,
      options: {
        reconnect: true,
        // connectionCallback (err) {
        //   RED.log.trace("ConnectionCallback Error: " + safeJSONStringify(err))
        //   if (err) {
        //     node.status({ fill: 'red', shape: 'ring', text: err })
        //   } else {
        //     node.status({ fill: 'green', shape: 'ring', text: 'Connected' })
        //   }
        // }
      },
      webSocketImpl: ws
    })
    link.subscriptionClient.onConnected(() => {
      node.debug('Connected')
      node.status({ fill: 'green', shape: 'ring', text: 'Connected' })
    })
    link.subscriptionClient.onDisconnected(() => {
      // node.status({ fill: 'yellow', shape: 'ring', text: 'Disconnected' })
    })
    link.subscriptionClient.onError(err => {
      node.error("connection error: " + err.message, {})
      node.status({ fill: 'red', shape: 'ring', text: 'Error: ' + err.message })
    })
    const client = new ApolloClient({ link, cache: new InMemoryCache() })

    client.subscribe({
      fetchPolicy: 'network-only',
      query: gql`${config.template}`
    }).subscribe({
      next (data) {
        node.send({ payload: data })
      },
      error (err) {
        RED.log.error(err)
      }
    })

    node.on('close', function () {
      node.status({ fill: 'yellow', shape: 'ring', text: 'Disconnected' })
      link.subscriptionClient.close()
    });
  }
  RED.nodes.registerType("gql-sub", GraphQLSubscriptionNode);

  function GraphqlServerNode (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    //node.status({ fill:"blue", shape:"ring", text:"connecting" });
    // RED.log.debug("--- GraphqlNode v" + vers + " ---");
    RED.log.debug("GraphqlServerNode node: " + safeJSONStringify(node));
    RED.log.trace("GraphqlServerNode config: " + safeJSONStringify(config));
    node.endpoint = config.endpoint;
  }
  RED.nodes.registerType("gql-sub-server", GraphqlServerNode, {
    credentials: {
      user: { type: "text" },
      password: { type: "password" },
      serviceTicket: { type: "password" }
    }
  });

  function safeJSONStringify (input, maxDepth) {
    var output,
      refs = [],
      refsPaths = [];

    maxDepth = maxDepth || 5;

    function recursion (input, path, depth) {
      var output = {},
        pPath,
        refIdx;

      path = path || "";
      depth = depth || 0;
      depth++;

      if (maxDepth && depth > maxDepth) {
        return "{depth over " + maxDepth + "}";
      }

      for (var p in input) {
        pPath = (path ? path + "." : "") + p;
        if (typeof input[p] === "function") {
          output[p] = "{function}";
        } else if (typeof input[p] === "object") {
          refIdx = refs.indexOf(input[p]);

          if (-1 !== refIdx) {
            output[p] = "{reference to " + refsPaths[refIdx] + "}";
          } else {
            refs.push(input[p]);
            refsPaths.push(pPath);
            output[p] = recursion(input[p], pPath, depth);
          }
        } else {
          output[p] = input[p];
        }
      }

      return output;
    }

    if (typeof input === "object") {
      output = recursion(input);
    } else {
      output = input;
    }

    return JSON.stringify(output);
  }
}