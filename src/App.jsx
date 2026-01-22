import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ArrowDown, Zap, RefreshCw, Plus, Trash2, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';

const DEX_ADDRESS = "0x0aEa13Db0b307a541E22cd272BB34f8e6FeE7c52"; 
const SLVR_ADDRESS = "0x571e42E46AFd658471d609B19448bd0ef910E777";
const WKII_ADDRESS = "0x5B8832c0087c2E1F2Df579567A93B8d1420329B0";
const POOL_ID = "0xf0d632cccf45506f4a5b2df2251e9edd54681e79135ddc65f5b6995699fbad6c";

const DEX_ABI = [
  "function swapKIIForToken(bytes32 poolId) external payable",
  "function swap(bytes32 poolId, address tokenIn, uint256 amountIn) external",
  "function addLiquidity(bytes32 poolId, uint256 amount0, uint256 amount1) external",
  "function removeLiquidity(bytes32 poolId, uint256 lpAmount) external"
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
];

export default function App() {
  const [tab, setTab] = useState('swap');
  const [account, setAccount] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [amountAdd0, setAmountAdd0] = useState('');
  const [amountAdd1, setAmountAdd1] = useState('');
  const [lpRemoveAmount, setLpRemoveAmount] = useState('');
  const [balances, setBalances] = useState({ kii: '0.000000', slvr: '0.000000' });
  const [loading, setLoading] = useState(false);
  const [isKiiTop, setIsKiiTop] = useState(true);

  const fetchBalances = async (acc) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const kiiBal = await provider.getBalance(acc);
      const slvrContract = new ethers.Contract(SLVR_ADDRESS, ERC20_ABI, provider);
      const sBal = await slvrContract.balanceOf(acc);
      setBalances({ 
        kii: parseFloat(ethers.formatEther(kiiBal)).toFixed(6), 
        slvr: parseFloat(ethers.formatEther(sBal)).toFixed(6) 
      });
    } catch (e) { console.error(e); }
  };

  const connect = async () => {
    if (!window.ethereum) return toast.error("Install MetaMask!");
    const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
    setAccount(accs[0]);
    fetchBalances(accs[0]);
  };

  const handleSwap = async () => {
    if (!amountIn || !account) return connect();
    setLoading(true);
    const toastId = toast.loading("Processing...");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const dex = new ethers.Contract(DEX_ADDRESS, DEX_ABI, signer);
      if (isKiiTop) {
        await (await dex.swapKIIForToken(POOL_ID, { value: ethers.parseEther(amountIn) })).wait();
      } else {
        const slvr = new ethers.Contract(SLVR_ADDRESS, ERC20_ABI, signer);
        await (await slvr.approve(DEX_ADDRESS, ethers.parseEther(amountIn))).wait();
        await (await dex.swap(POOL_ID, SLVR_ADDRESS, ethers.parseEther(amountIn))).wait();
      }
      toast.success("Swap Success!", { id: toastId });
      fetchBalances(account);
      setAmountIn('');
    } catch (e) { toast.error("Failed"); }
    setLoading(false);
  };

  const handleAddLiquidity = async () => {
    if (!amountAdd0 || !amountAdd1 || !account) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const dex = new ethers.Contract(DEX_ADDRESS, DEX_ABI, signer);
      const wkii = new ethers.Contract(WKII_ADDRESS, ["function deposit() payable", "function approve(address,uint256)"], signer);
      const slvr = new ethers.Contract(SLVR_ADDRESS, ERC20_ABI, signer);
      await (await wkii.deposit({ value: ethers.parseEther(amountAdd1) })).wait();
      await (await slvr.approve(DEX_ADDRESS, ethers.parseEther(amountAdd0))).wait();
      await (await wkii.approve(DEX_ADDRESS, ethers.parseEther(amountAdd1))).wait();
      await (await dex.addLiquidity(POOL_ID, ethers.parseEther(amountAdd0), ethers.parseEther(amountAdd1))).wait();
      toast.success("Liquidity Added!");
      fetchBalances(account);
    } catch (e) { toast.error("Failed"); }
    setLoading(false);
  };

  const handleRemoveLiquidity = async () => {
    if (!lpRemoveAmount || !account) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const dex = new ethers.Contract(DEX_ADDRESS, DEX_ABI, signer);
      await (await dex.removeLiquidity(POOL_ID, ethers.parseEther(lpRemoveAmount))).wait();
      toast.success("Liquidity Removed!");
      fetchBalances(account);
    } catch (e) { toast.error("Failed"); }
    setLoading(false);
  };

  return (
    <div style={styles.body}>
      <Toaster />
      
      {/* Header Navbar */}
      <nav style={styles.nav}>
        <div style={styles.logoGroup}>
          <div style={styles.logoIcon}>D</div>
          <span style={styles.brandName}>DECENTRALIZED</span>
        </div>
        <button onClick={connect} style={styles.connectBtn}>
          {account ? `${account.slice(0,6)}...${account.slice(-4)}` : 'CONNECT'}
        </button>
      </nav>

      {/* Main Container */}
      <div style={styles.container}>
        
        {/* Tab Switcher */}
        <div style={styles.tabBox}>
          <button onClick={() => setTab('swap')} style={{...styles.tabBtn, background: tab === 'swap' ? '#10b981' : 'transparent', color: tab === 'swap' ? '#000' : '#444'}}>SWAP</button>
          <button onClick={() => setTab('pool')} style={{...styles.tabBtn, background: tab === 'pool' ? '#10b981' : 'transparent', color: tab === 'pool' ? '#000' : '#444'}}>LIQUIDITY</button>
          <button style={styles.tabBtn} disabled>STAKE</button>
        </div>

        {tab === 'swap' ? (
          <div style={styles.content}>
            {/* Box Pay */}
            <div style={styles.inputCard}>
              <div style={styles.inputHeader}>
                <span style={styles.label}>YOU PAY</span>
                <span style={styles.balance}>BALANCE: {isKiiTop ? balances.kii : balances.slvr} {isKiiTop ? 'KII' : 'SLVR'}</span>
              </div>
              <div style={styles.inputRow}>
                <input type="number" placeholder="0.0" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} style={styles.amountInput} />
                <div style={styles.tokenSelect} onClick={() => setIsKiiTop(!isKiiTop)}>
                  {isKiiTop ? 'KII' : 'SLVR'} <ChevronDown size={14} />
                </div>
              </div>
            </div>

            {/* Switch Arrow */}
            <div style={styles.arrowBox}>
              <div style={styles.arrowCircle} onClick={() => setIsKiiTop(!isKiiTop)}>
                <ArrowDown size={18} color="#10b981" />
              </div>
            </div>

            {/* Box Receive */}
            <div style={styles.inputCard}>
              <div style={styles.inputHeader}>
                <span style={styles.label}>YOU RECEIVE</span>
                <span style={styles.balance}>BALANCE: {isKiiTop ? balances.slvr : balances.kii} {isKiiTop ? 'SLVR' : 'KII'}</span>
              </div>
              <div style={styles.inputRow}>
                <div style={styles.amountDisplay}>{amountIn ? (amountIn * 0.99).toFixed(4) : '0.0'}</div>
                <div style={styles.tokenSelect}>
                  {isKiiTop ? 'SLVR' : 'KII'} <ChevronDown size={14} />
                </div>
              </div>
            </div>

            <div style={styles.secText}>SECURED PROTOCOL</div>
            <button onClick={handleSwap} disabled={loading} style={styles.mainActionBtn}>
              {loading ? 'PROCESSING...' : 'SWAP NOW'}
            </button>
          </div>
        ) : (
          <div style={styles.content}>
            {/* LIQUIDITY SECTION */}
            <div style={styles.inputCard}>
              <span style={styles.label}>ADD LIQUIDITY</span>
              <input type="number" placeholder="KII Amount" value={amountAdd1} onChange={(e) => setAmountAdd1(e.target.value)} style={styles.simpleInput} />
              <input type="number" placeholder="SLVR Amount" value={amountAdd0} onChange={(e) => setAmountAdd0(e.target.value)} style={{...styles.simpleInput, marginTop: '10px'}} />
              <button onClick={handleAddLiquidity} style={styles.addLiqBtn}>+ ADD LIQUIDITY</button>
            </div>

            <div style={{...styles.inputCard, marginTop: '20px'}}>
              <span style={styles.label}>REMOVE LIQUIDITY</span>
              <input type="number" placeholder="LP Token Amount" value={lpRemoveAmount} onChange={(e) => setLpRemoveAmount(e.target.value)} style={styles.simpleInput} />
              <button onClick={handleRemoveLiquidity} style={styles.removeLiqBtn}>REMOVE MODAL</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  body: { minHeight: '100vh', background: '#020a08', color: '#fff', fontFamily: '"Arial Black", Gadget, sans-serif' },
  nav: { display: 'flex', justifyContent: 'space-between', padding: '20px 60px', alignItems: 'center' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
  logoIcon: { background: '#10b981', color: '#000', padding: '5px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '20px', boxShadow: '0 0 15px #10b981aa' },
  brandName: { letterSpacing: '3px', fontWeight: 'bold', fontSize: '22px', color: '#10b981' },
  connectBtn: { background: '#10b981', color: '#000', border: 'none', padding: '10px 25px', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' },
  container: { maxWidth: '550px', margin: '40px auto', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '40px', padding: '30px', boxShadow: '0 40px 100px rgba(0,0,0,0.8)' },
  tabBox: { display: 'flex', background: '#000', borderRadius: '20px', padding: '5px', marginBottom: '30px' },
  tabBtn: { flex: 1, border: 'none', padding: '15px', borderRadius: '15px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: '0.3s' },
  content: { display: 'flex', flexDirection: 'column', gap: '5px' },
  inputCard: { background: 'rgba(0,0,0,0.4)', padding: '25px', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.05)' },
  inputHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px' },
  label: { color: '#10b981', fontSize: '11px', letterSpacing: '1px' },
  balance: { color: '#555', fontSize: '11px' },
  inputRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  amountInput: { background: 'transparent', border: 'none', color: '#fff', fontSize: '40px', outline: 'none', width: '60%' },
  amountDisplay: { fontSize: '40px', color: '#888' },
  tokenSelect: { background: '#121212', border: '1px solid #333', padding: '8px 15px', borderRadius: '15px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' },
  arrowBox: { display: 'flex', justifyContent: 'center', margin: '-20px 0', zIndex: 10, position: 'relative' },
  arrowCircle: { background: '#020a08', border: '1px solid #10b981', padding: '12px', borderRadius: '50%', cursor: 'pointer' },
  secText: { textAlign: 'center', fontSize: '11px', color: '#333', margin: '25px 0', letterSpacing: '4px' },
  mainActionBtn: { background: '#065f46', color: '#10b981', border: 'none', width: '100%', padding: '25px', borderRadius: '25px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },
  simpleInput: { background: '#000', border: '1px solid #222', padding: '15px', borderRadius: '12px', width: '100%', boxSizing: 'border-box', color: '#fff' },
  addLiqBtn: { width: '100%', marginTop: '15px', padding: '15px', background: '#10b98122', color: '#10b981', border: '1px solid #10b981', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' },
  removeLiqBtn: { width: '100%', marginTop: '10px', padding: '15px', background: '#ff444411', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }
};