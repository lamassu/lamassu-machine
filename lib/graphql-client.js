const _ = require('lodash/fp')
const { Agent } = require('https')
const path = require('path')

require('core-js/features/promise')
const { ApolloClient, InMemoryCache, HttpLink, gql } = require('@apollo/client/core')
const node_fetch = require('node-fetch')

const fetchOptions = (() => {
  const conf = (() => {
    /* TODO: Sort of duplicated code from `brain.js`. */
    const conf = require('./configuration').loadConfig({})
    const dataPath = path.resolve(__dirname, '..', conf.brain.dataPath)
    const resolve = file => path.resolve(dataPath, file)

    return {
      certPath: {
        cert: resolve(conf.brain.certs.certFile),
        key: resolve(conf.brain.certs.keyFile)
      },
      connectionInfoPath: resolve(conf.brain.connectionInfoPath)
    }
  })()

  const pairing = require('./pairing')
  const options = _.flow(
    _.assign(pairing.getCert(conf.certPath)),
    _.assign(pairing.connectionInfo(conf.connectionInfoPath))
  )({ rejectUnauthorized: true })

  return _.set('agent', new Agent(options), options)
})()

const makeQueryString = _.flow(
  _.toPairs,
  _.map(_.join('=')),
  _.join('&')
)

const fetch = (uri, options) =>
  node_fetch(uri, _.update('headers', _.set('date', new Date().toISOString()), options))

const makeURI = (host, port, opts) =>
  'https://' + host +':' + port + '/graphql?' + makeQueryString(opts)

/*
 * opts is a { key: val, ... } object that will be turned into the
 * `key=val&...` query string
 */
const GraphQLClient = (host, port, opts) =>
  new ApolloClient({
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache',
        errorPolicy: 'all',
      }
    },
    link: new HttpLink({
      uri: makeURI(host, port, opts),
      fetch,
      fetchOptions
    })
  })

module.exports = { gql, GraphQLClient }
