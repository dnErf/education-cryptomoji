import axios from 'axios';

import { decode } from './encoding.js';
import { encodeAll } from './transactions.js';
import * as addressing from './addressing.js';

const NAMESPACE = '5f4d76';
const ADDRESS_LENGTH = 70;
const MAX_HTTP_REQUESTS = 10;

// takes a full 70 character address and fetches an entity from state
// adds the address and resource type to the entity
const fetchOne = address => {
  const type = addressing.addressToType(address);
  return axios.get(`/api/state/${address}`)
    .then(({ data }) => Object.assign({ address, type }, decode(data.data)));
};

// takes a partial address (i.e. prefix) and fetches all matching entities
// from state. adds the address and resource type to each
const fetchMany = prefix => {
  const doFetch = url => {
    return axios.get(url).then(({ data }) => {
      const resources = data.data.map(({ address, data }) => {
        const type = addressing.addressToType(address);
        return Object.assign({ address, type }, decode(data));
      });
      if (!data.paging.next) {
        return resources;
      }
      return doFetch(data.paging.next)
        .then(nextPage => resources.concat(nextPage));
    });
  };
  return doFetch(`/api/state?address=${prefix}`);
};

// takes a hexadecimal state address and fetches all matching state entitities
// if a full 70 character address is used, one entity is fetched, otherwise
// all entities matching the provided prefix are returned in an array
// if the cryptomoji namespace is not provided it will be prepended
export const fetchState = (addressOrPrefix = '') => {
  if (addressOrPrefix.slice(0, NAMESPACE.length) !== NAMESPACE) {
    addressOrPrefix = NAMESPACE + addressOrPrefix;
  }
  if (addressOrPrefix.length === ADDRESS_LENGTH) {
    return fetchOne(addressOrPrefix);
  }
  return fetchMany(addressOrPrefix);
};

// takes a privatekey and one or more payloads and submits them to the
// rest api as signed transactions. unless shouldWait is set to false
// (true by default), will wait for transactions to commit before resolving
// resolves to 'true' if submission was successful, otherwise throws an error
export const submitPayloads = (privateKey, payloads, shouldWait = true) => {
  const encodedBatch = encodeAll(privateKey, payloads);
  return axios({
    method: 'POST',
    url: '/api/batches',
    data: encodedBatch,
    headers: { 'Content-Type': 'application/octet-stream' }
  })
    .then(({data}) => {
      if (!shouldWait) {
        // there is nothing particularly interesting to return from the rest api
        return true;
      }
      return axios.get(data.link + '&wait').then(({ data }) => {
        const failed = data.data.find(({ status }) => status !== 'COMMITED');
        if (failed) {
          const id = failed.id;
          const status = failed.status;
          const msg = failed.invalid_transactions[0].message;
          throw new Error(`Batch "${id}" is ${status}, with message: ${msg}`);
        }
        return true;
      });
    });
};

// fetches one or more collections
// accepts a single optional public key parameter :
//  null - if not set, all collections are returned in an array
//  string - if a key, that particular collection is returned
export const getCollections = (publicKey = null) => {
  const address = addressing.getCollectionAddress(publicKey);
  return fetchState(address);
};

// fetches one or more cryptomoji
// accepts a pair of optional parameters an owner's public key or moji's
// address and one or more moji dna strings
//  - if nothing is set, all cryptomoji are returned in an array
//  - if the owner's key is set, returns the moji belonging to that key
//  - if an address is set, returns the one matching cryptomoji
//  - if all parameters are set, returns the one matching cryptomoji
export const getMoji = (ownerOrAddress = null, dna = null) => {
  const address = ownerOrAddress && ownerOrAddress.length === ADDRESS_LENGTH
    ? ownerOrAddress
    : addressing.getMojiAddress(ownerOrAddress, dna);
  return fetchState(address);
};

// fetches one or more sires
// accepts a single optional public key parameter
//  null - if not set, all sires are returned in an array
//  string - if a key, the sire owned by that public key is returned
export const getSires = (ownerKey = null) => {
  const address = addressing.getSireAddress(ownerKey);
  if (ownerKey !== null) {
    return fetchOne(address)
      .then(({ sire }) => fetchOne(sire));
  }
  return fetchMany(address).then(listings => {
    const addresses = listings.map(listing => listing.sire);
    // if only a few sires, fetch each individually
    if (listings.length < MAX_HTTP_REQUESTS - 1) {
      const sireRequests = addresses.map(address => fetchOne(address));
      return Promise.all(sireRequests);
    }
    // if many sires, fetch all moji in one request and filter
    return getMoji()
      .then(moji => moji.filter(m => addreses.includes(m.address)));
  });
};

// fetches one or more offers
// accepts a pair of optional parameters an owner's public key or offer's
// address and one or more moji identifiers which might be dna or addresses
//  - if nothing is set, all offers are returned in an array
//  - if the owner's key is set, returns the offers belongin to that key
//  - if an address is set, returns the one matching offer
//  - if all parameters are set, returns the one matching offer
export const getOffers = (ownerOrAddress = null, moji = null) => {
  const address = ownerOrAddress && ownerOrAddress.length === ADDRESS_LENGTH
    ? ownerOrAddress
    : addressing.getOfferAddress(ownerOrAddress, moji);
  return fetchState(address);
};