module.exports = function (RED) {
  var ws = require('ws')
  var ApolloClient = require('apollo-boost').ApolloClient;
  var WebSocketLink = require('apollo-link-ws').WebSocketLink;
  var InMemoryCache = require('apollo-cache-inmemory').InMemoryCache;
  var gql = require('graphql-tag')

  function GraphQLSubscriptionNode (config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.msgCount = 0;
    node.graphqlConfig = RED.nodes.getNode(config.graphql);

    if (!node.graphqlConfig) {
      this.error("invalid graphql config");
    }

    if (!config.active) {
      node.status({ fill: "grey", shape: 'ring', text: 'Inactive' })
      return
    }

    node.status({ fill: 'yellow', shape: 'ring', text: 'Disconnected' })
    function startSub () {
      var link = new WebSocketLink({
        uri: node.graphqlConfig.endpoint,
        options: { reconnect: false },
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
        setTimeout(() => {
          node.log('reconnecting')
          startSub()
        }, (node.graphqlConfig.connectionretrytimeout * 1) || 5000)
      })
      node.link = link
      var client = new ApolloClient({ link, cache: new InMemoryCache() })

      client.subscribe({
        fetchPolicy: 'network-only',
        query: gql`${config.template}`
      }).subscribe({
        next (data) {
          node.send({ payload: data })
          node.msgCount++
          node.status({ fill: 'green', shape: 'ring', text: `Connected: ${node.msgCount}` })
        },
        error (err) {
          RED.log.error(err)
          node.status({ fill: 'red', shape: 'ring', text: 'Query Error: ' + err.message })
        }
      })
    }
    startSub()

    node.on('close', function () {
      node.status({ fill: 'yellow', shape: 'ring', text: 'Disconnected' })
      node.link.subscriptionClient.close()
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
    // console.log(safeJSONStringify(config))
    node.endpoint = config.endpoint;
    node.connectionretrytimeout = config.connectionretrytimeout;
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

  // RED.httpAdmin.post("/gql-sub/:id/:state", function (req, res) {
  //   var node = RED.nodes.getNode(req.params.id);
  //   var state = req.params.state;
  //   if (node !== null && typeof node !== "undefined") {
  //     if (state === "enable") {
  //       node.active = true;
  //       res.sendStatus(200);
  //       node.status({ fill: "grey", shape: "dot" });
  //     } else if (state === "disable") {
  //       node.active = false;
  //       res.sendStatus(201);
  //       if (node.hasOwnProperty("oldStatus")) {
  //         node.oldStatus.shape = "dot";
  //         node.status(node.oldStatus);
  //       }
  //     } else {
  //       res.sendStatus(404);
  //     }
  //   } else {
  //     res.sendStatus(404);
  //   }
  // });
}
