import '../styles/globals.css'
import type { AppProps } from 'next/app'

import './reactCOIServiceWorker';

import ZkappWorkerClient from './zkappWorkerClient';


import  {
  PublicKey,
  PrivateKey,
  Field,

} from 'snarkyjs'
import { useEffect, useState } from 'react';


let transactionFee = 0.1;




export default function App({ Component, pageProps }: AppProps) {
  let [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentNum: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTRansaction: false
  })

  // todo setup
  useEffect(() => {
    (async () => {
      if (!state.hasBeenSetup) {
        const zkappWorkerClient = new ZkappWorkerClient();

        console.log('loading snarkyjs');

        await zkappWorkerClient.loadSnarkyJS();
        console.log('done');

        await zkappWorkerClient.setActiveInstanceToBerkeley();

        const mina = (window as any).mina;
        if (mina === null) {
          setState({...state, hasWallet: false});
          return;
        }

        const publicKeyBase58 : string = (await mina.requestAccounts())[0];
        const publicKey = PublicKey.fromBase58(publicKeyBase58);

        console.log('using key', publicKey.toBase58());

        console.log('checking if account exists');

        const res = await zkappWorkerClient.fetchAccount({publicKey: publicKey});
        const accountExists = res.error == null;
        console.log('account exists', accountExists);

        // add contract 

        await zkappWorkerClient.loadContract();

        console.log('compiling zkApp');

        await zkappWorkerClient.compileContract();

        console.log('zkApp compiled');

        const zkappPublicKey = PublicKey.fromBase58('B62qjwqh6LbJygzn3YowBJcHtE8pzDej3XuwW6XRQJqsTzkjZtmHjRV');

        await zkappWorkerClient.initZkappInstance(zkappPublicKey);

        console.log('getting zkApp state...');

        await zkappWorkerClient.fetchAccount({publicKey: zkappPublicKey});
        const currentNum = await zkappWorkerClient.getNum();
        console.log('current state:', currentNum.toString());

        setState({
          ...state, 
          zkappWorkerClient,
          hasWallet: true,
          hasBeenSetup: true,
          publicKey,
          zkappPublicKey,
          accountExists,
          currentNum
        });
      }
    })();
  });

  useEffect(() => {
    (async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        for(;;) {
          console.log('checking if account exists....');
          const res = await state.zkappWorkerClient!.fetchAccount({publicKey: state.publicKey!});
          const accountExists = res.error == null;
          if (accountExists) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 5000));

        }
        setState({...state, accountExists: true});
      }
    })();
  }, [state.hasBeenSetup]);


  //send transaction 
  const onSendTransaction = async () => {
    setState({...state, creatingTRansaction: true});
    console.log('sending a trasnaction...');

    await state.zkappWorkerClient!.fetchAccount({publicKey: state.publicKey!});

    await state.zkappWorkerClient!.createUpdateTransaction();

    console.log('creating proof...');
    await state.zkappWorkerClient!.proveUpdateTransaction();

    console.log('getting Transaction json...');
    const transactionJSon = await state.zkappWorkerClient!.getTransactionJSON();

    console.log('requests send transaction...');
    const {hash} = await(window as any).mina.sendTransaction({
      transaction: transactionJSon,
      feePlayer: {
        fee: transactionFee,
        memo: ''
      }
    });

    console.log('See transaction at https://berkeley.minaexplorer.com/transaction/' + hash);

    setState({...state, creatingTRansaction: false});
  }

  // refresh the current state
  const onRefreshCurentNum = async () => {
    console.log('getting zkApp state...');
    await state.zkappWorkerClient!.fetchAccount({publicKey: state.publicKey!});
    const currentNum = await state.zkappWorkerClient!.getNum();
    console.log('current state:', currentNum.toString());
    setState({...state, currentNum});
  }

  // create UI
  let hasWallet;
  if (state.hasWallet !== null && !state.hasWallet) {
    const auroLink = 'https://www.aurowallet.com/';
    const auroLinkElem = <a href={auroLink} target="_blank" rel="noreferrer"> [Link] </a>
    hasWallet = <div> Could not find a wallet. Install Auro wallet here: { auroLinkElem }</div>
  }

  let setupText = state.hasBeenSetup ? 'Snarkyjs Ready' : 'Setting up SnakryJS...';
  let setup = <div>{setupText} {hasWallet}</div>;


  let accountDoesNotExists;
  if (state.hasBeenSetup && !state.accountExists) {
    const faucetLink =  "https://faucet.minaprotocol.com/?address=" + state.publicKey!.toBase58();
    accountDoesNotExists = <div>
      Account does not exist. Please viti the faucet to fund this account
      <a href={faucetLink} target="_blank" rel="noreferrer"> [Link] </a>
    </div>
  }

  let mainContent
  if (state.hasBeenSetup && state.accountExists) {
    mainContent = <div>
      <button onClick={onSendTransaction} disabled={state.creatingTRansaction}>Send Transaction</button>
      <div>Current Number is zkApp: {state.currentNum!.toString()}</div>
      <button onClick={onRefreshCurentNum}>Get Latest State</button>
    </div>
  }


  return <div>
    {setup}
    {accountDoesNotExists}
    {mainContent}
  </div>
}
