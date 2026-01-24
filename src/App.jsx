import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { ChevronDown, ArrowUpDown, X, Loader2, Droplets, Trash2, Coins, Wallet } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';

// --- CONFIG ---
import coreData from './constants/core_testnet.json';
import tokenListData from './constants/tokenList.json';

const MY_AGGREGATOR = "0x7abB56F87646B545dfeA9b9b94451a3780Ee2b87"; 
const WKII_ADDRESS = "0xd51e7187e54a4A22D790f8bbDdd9B54b891Bc920";
const POSITION_MANAGER_ADDRESS = "0x841231Aa31685321E0bAED56e4b17Cae093Bf0fB";
const CORRECT_RPC = "https://json-rpc.dos.sentry.testnet.v3.kiivalidator.com/";

const AGGREGATOR_ABI = [
  "function swapKii(address tokenOut) external payable",
  "function swapTokenToKii(address tokenIn, uint256 amountIn) external",
  "function swapUniversal(address tokenIn, address tokenOut, uint256 amountIn) external",
  "function addLiquidity(address tokenOther, uint256 amountOther) external payable",
  "function removeLiquidityFull(uint256 tokenId, uint128 liquidity) external",
  "function collectOnly(uint256 tokenId) external"
];

const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut)"
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) external returns (bool)", "function balanceOf(address) view returns (uint256)"];
const POSITION_MANAGER_ABI = [
  "function approve(address to, uint256 tokenId) external", 
  "function balanceOf(address owner) view returns (uint256)", 
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)", 
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
];

// PERBAIKAN: Gunakan "NATIVE" agar tidak bentrok dengan alamat WKII
const NATIVE_KII = { 
  symbol: 'KII', 
  name: 'Native KII', 
  address: "NATIVE", 
  decimals: 18,
  logoURI: "https://avatars.githubusercontent.com/u/139797706" 
};
const FULL_TOKEN_LIST = [NATIVE_KII, ...tokenListData.tokens];

export default function App() {
  const [tab, setTab] = useState('swap');
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState({});
  const [tokenIn, setTokenIn] = useState(FULL_TOKEN_LIST[0]);
  const [tokenOut, setTokenOut] = useState(FULL_TOKEN_LIST[1]);
  const [amount, setAmount] = useState('');
  const [amountOutManual, setAmountOutManual] = useState(''); 
  const [estimatedOut, setEstimatedOut] = useState('0.00');
  const [priceLoading, setPriceLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('in');
  const [userPositions, setUserPositions] = useState([]);

  const connectWallet = async () => {
    if (window.ethereum) {
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accs[0]);
    }
  };

  // PERBAIKAN: Fungsi fetch saldo yang jauh lebih akurat
  const fetchBalances = useCallback(async () => {
    if (!account) return;
    try {
      const provider = new ethers.JsonRpcProvider(CORRECT_RPC);
      const newBals = {};
      for (const t of FULL_TOKEN_LIST) {
        try {
          if (t.address === "NATIVE") {
            const b = await provider.getBalance(account);
            newBals[t.address] = ethers.formatEther(b);
          } else {
            const c = new ethers.Contract(t.address, ERC20_ABI, provider);
            const b = await c.balanceOf(account).catch(() => 0n);
            newBals[t.address] = ethers.formatUnits(b, t.decimals);
          }
        } catch (e) { 
          newBals[t.address] = "0"; 
        }
      }
      setBalances(newBals);
    } catch (e) {
      console.error("Balance fetch error", e);
    }
  }, [account]);

  const fetchPositions = useCallback(async () => {
    if (!account) return;
    try {
      const provider = new ethers.JsonRpcProvider(CORRECT_RPC);
      const manager = new ethers.Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, provider);
      const balance = await manager.balanceOf(account);
      const pos = [];
      for (let i = 0; i < Number(balance); i++) {
        const id = await manager.tokenOfOwnerByIndex(account, i);
        const detail = await manager.positions(id);
        pos.push({ 
          id: id.toString(), 
          liquidity: detail.liquidity.toString(),
          fee0: ethers.formatUnits(detail.tokensOwed0, 18), 
          fee1: ethers.formatUnits(detail.tokensOwed1, 18)
        });
      }
      setUserPositions(pos);
    } catch (e) { console.error("Fetch Pos Error:", e); }
  }, [account]);

  useEffect(() => { 
    fetchBalances(); 
    if (tab === 'remove') fetchPositions();
  }, [account, tab, fetchBalances, fetchPositions]);

  const fetchPrice = useCallback(async () => {
    if (tab !== 'swap') return;
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) { setEstimatedOut('0.00'); return; }
    setPriceLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(CORRECT_RPC);
      const quoter = new ethers.Contract(coreData.quoterV2Address, QUOTER_ABI, provider);
      
      // Mapping address untuk quoter (NATIVE diganti WKII_ADDRESS saat panggil contract)
      const addrIn = tokenIn.address === "NATIVE" ? WKII_ADDRESS : tokenIn.address;
      const addrOut = tokenOut.address === "NATIVE" ? WKII_ADDRESS : tokenOut.address;
      
      const valIn = ethers.parseUnits(amount, tokenIn.decimals);
      let out;
      if (tokenIn.symbol === 'KII' || tokenOut.symbol === 'KII') {
        out = await quoter.quoteExactInputSingle.staticCall({ tokenIn: addrIn, tokenOut: addrOut, amountIn: valIn, fee: 3000, sqrtPriceLimitX96: 0 });
      } else {
        const path = `0x${addrIn.replace('0x','')}${"000bb8"}${WKII_ADDRESS.replace('0x','')}${"000bb8"}${addrOut.replace('0x','')}`;
        out = await quoter.quoteExactInput.staticCall(path, valIn);
      }
      setEstimatedOut(ethers.formatUnits(out, tokenOut.decimals));
    } catch (e) { setEstimatedOut("No Pool"); }
    finally { setPriceLoading(false); }
  }, [amount, tokenIn, tokenOut, tab]);

  useEffect(() => { const t = setTimeout(fetchPrice, 500); return () => clearTimeout(t); }, [fetchPrice]);

  const handleAction = async () => {
    if(!account) return connectWallet();
    setLoading(true);
    const tid = toast.loading("Processing...");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const agg = new ethers.Contract(MY_AGGREGATOR, AGGREGATOR_ABI, signer);
      
      if(tab === 'swap') {
        if(tokenIn.address === 'NATIVE') {
            await (await agg.swapKii(tokenOut.address, { value: ethers.parseUnits(amount, 18) })).wait();
        } else if(tokenOut.address === 'NATIVE') {
          await (await new ethers.Contract(tokenIn.address, ERC20_ABI, signer).approve(MY_AGGREGATOR, ethers.parseUnits(amount, tokenIn.decimals))).wait();
          await (await agg.swapTokenToKii(tokenIn.address, ethers.parseUnits(amount, tokenIn.decimals))).wait();
        } else {
          await (await new ethers.Contract(tokenIn.address, ERC20_ABI, signer).approve(MY_AGGREGATOR, ethers.parseUnits(amount, tokenIn.decimals))).wait();
          await (await agg.swapUniversal(tokenIn.address, tokenOut.address, ethers.parseUnits(amount, tokenIn.decimals))).wait();
        }
      } else {
        const isToken1Kii = tokenIn.address === 'NATIVE';
        const tokenOther = isToken1Kii ? tokenOut : tokenIn;
        const amtKii = isToken1Kii ? amount : amountOutManual; 
        const amtOther = isToken1Kii ? amountOutManual : amount;
        if (!amtKii || !amtOther) throw new Error("Please enter both amounts");
        await (await new ethers.Contract(tokenOther.address, ERC20_ABI, signer).approve(MY_AGGREGATOR, ethers.parseUnits(amtOther, tokenOther.decimals))).wait();
        await (await agg.addLiquidity(tokenOther.address, ethers.parseUnits(amtOther, tokenOther.decimals), { value: ethers.parseUnits(amtKii, 18) })).wait();
      }
      toast.success("Success!", {id:tid}); 
      setAmount(''); setAmountOutManual(''); fetchBalances();
    } catch(e) { toast.error(e.message || "Failed!", {id:tid}); } 
    finally { setLoading(false); }
  };

  const LogoIcon = ({ t }) => (
    <div className="w-10 h-10 bg-[#0f172a] rounded-xl flex items-center justify-center overflow-hidden border border-slate-700 shadow-lg relative">
      <img src={t.logoURI} alt={t.symbol} className="w-full h-full object-contain p-1" onError={(e) => e.target.src = "https://raw.githubusercontent.com/YFiN99/earning/main/log.PNG"} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-4 font-sans uppercase tracking-tighter">
      <Toaster position="top-center" />
      <div className="w-full max-w-[550px] bg-[#0f172a] rounded-[44px] p-7 border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-10 px-2">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl border-2 border-orange-500/40 overflow-hidden shadow-2xl bg-slate-900">
              <img src="https://raw.githubusercontent.com/YFiN99/earning/main/log.PNG" alt="Logo" className="w-full h-full p-2" />
            </div>
            <div>
              <h1 className="text-3xl font-black italic">PREDATOR <span className="text-orange-500">DEX</span></h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">V3 ENGINE ACTIVE</span>
              </div>
            </div>
          </div>
          <button onClick={connectWallet} className="text-[10px] font-black bg-[#1e293b] px-5 py-3 rounded-2xl border border-slate-700 text-orange-500">
            {account ? `${account.slice(0,6)}...${account.slice(-4)}` : 'CONNECT'}
          </button>
        </div>

        <div className="flex bg-slate-900/80 p-1.5 rounded-[22px] mb-8 border border-slate-800/50 shadow-inner">
          {['swap', 'pool', 'remove'].map(m => (
            <button key={m} onClick={() => { setTab(m); setAmount(''); setAmountOutManual(''); }} className={`flex-1 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${tab === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{m}</button>
          ))}
        </div>

        {(tab === 'swap' || tab === 'pool') && (
          <div className="space-y-1">
            <div className="bg-[#1e293b]/40 p-6 rounded-[32px] border border-slate-800/60">
              <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-3 uppercase">
                <span>{tab === 'swap' ? 'Pay' : 'Asset 1'}</span>
                <span className="text-indigo-400 cursor-pointer" onClick={() => setAmount(balances[tokenIn.address] || '0')}>
                   BAL: {parseFloat(balances[tokenIn.address] || 0).toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" className="bg-transparent text-4xl font-black outline-none w-1/2 placeholder:text-slate-800" />
                <button onClick={() => { setModalType('in'); setIsModalOpen(true); }} className="bg-slate-800 hover:bg-slate-700 px-4 py-3 rounded-2xl border border-slate-700 flex items-center gap-3 font-black text-sm transition-all shadow-xl">
                  <LogoIcon t={tokenIn} /> {tokenIn.symbol} <ChevronDown size={16} className="text-indigo-500" />
                </button>
              </div>
            </div>

            <div className="flex justify-center -my-6 relative z-10">
              <button onClick={() => { setTokenIn(tokenOut); setTokenOut(tokenIn); setAmount(''); setAmountOutManual(''); }} className="bg-[#0f172a] p-4 rounded-2xl border border-slate-800 text-indigo-500 shadow-2xl hover:scale-110 active:rotate-180 transition-all">
                <ArrowUpDown size={22} />
              </button>
            </div>

            <div className="bg-[#1e293b]/40 p-6 rounded-[32px] border border-slate-800/60 mt-2">
              <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-3 uppercase">
                <span>{tab === 'swap' ? 'Receive' : 'Asset 2'}</span>
                <span className="text-slate-600">BAL: {parseFloat(balances[tokenOut.address] || 0).toFixed(4)}</span>
              </div>
              <div className="flex items-center justify-between">
                {tab === 'swap' ? (
                  <div className="text-3xl font-black truncate">
                    {priceLoading ? <Loader2 className="animate-spin text-indigo-500"/> : estimatedOut}
                  </div>
                ) : (
                  <input type="number" value={amountOutManual} onChange={(e) => setAmountOutManual(e.target.value)} placeholder="0.0" className="bg-transparent text-4xl font-black outline-none w-1/2 placeholder:text-slate-800" />
                )}
                <button onClick={() => { setModalType('out'); setIsModalOpen(true); }} className="bg-slate-800 hover:bg-slate-700 px-4 py-3 rounded-2xl border border-slate-700 flex items-center gap-3 font-black text-sm transition-all shadow-xl">
                  <LogoIcon t={tokenOut} /> {tokenOut.symbol} <ChevronDown size={16} className="text-indigo-500" />
                </button>
              </div>
            </div>

            <button onClick={handleAction} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 py-6 rounded-[30px] font-black text-lg mt-6 shadow-xl shadow-indigo-500/20 active:scale-95 transition-all italic tracking-tighter uppercase">
              {loading ? "PENDING..." : (tab === 'swap' ? 'Confirm Swap' : 'Add Liquidity')}
            </button>
          </div>
        )}

        {tab === 'remove' && (
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {userPositions.length === 0 && <div className="text-center py-20 text-slate-600 font-bold text-[10px] tracking-[0.2em]">No Liquidity Found</div>}
            {userPositions.map((p) => (
              <div key={p.id} className="bg-[#1e293b]/40 p-6 rounded-[32px] border border-slate-800 hover:border-indigo-500/30 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-xs font-black text-indigo-400 mb-2 uppercase">Position #{p.id}</div>
                    <div className="space-y-1">
                        <div className="text-[10px] font-black text-green-400">FEE 0: {parseFloat(p.fee0).toFixed(6)}</div>
                        <div className="text-[10px] font-black text-green-400">FEE 1: {parseFloat(p.fee1).toFixed(6)}</div>
                    </div>
                  </div>
                  <div className="text-[9px] bg-slate-800 px-3 py-1.5 rounded-xl font-black text-slate-400 uppercase tracking-widest">NFT LP</div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <button 
                      disabled={loading || (parseFloat(p.fee0) === 0 && parseFloat(p.fee1) === 0)}
                      onClick={async () => {
                        setLoading(true); const tid = toast.loading("Collecting...");
                        try {
                          const signer = await (new ethers.BrowserProvider(window.ethereum)).getSigner();
                          const manager = new ethers.Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, signer);
                          await (await manager.approve(MY_AGGREGATOR, p.id)).wait();
                          await (await new ethers.Contract(MY_AGGREGATOR, AGGREGATOR_ABI, signer).collectOnly(p.id)).wait();
                          toast.success("Collected!", {id: tid}); fetchPositions();
                        } catch(e) { toast.error("Fail", {id: tid}); } finally { setLoading(false); }
                      }} 
                      className="bg-green-500/10 py-3.5 rounded-2xl text-green-500 border border-green-500/20 hover:bg-green-500 hover:text-white transition-all font-black text-[10px] flex items-center justify-center gap-2 disabled:opacity-20"
                    >
                        <Coins size={14}/> COLLECT
                    </button>

                    <button 
                      disabled={loading}
                      onClick={async () => {
                        setLoading(true); const tid = toast.loading("Removing...");
                        try {
                          const signer = await (new ethers.BrowserProvider(window.ethereum)).getSigner();
                          const manager = new ethers.Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, signer);
                          await (await manager.approve(MY_AGGREGATOR, p.id)).wait();
                          await (await new ethers.Contract(MY_AGGREGATOR, AGGREGATOR_ABI, signer).removeLiquidityFull(p.id, p.liquidity)).wait();
                          toast.success("Removed!", {id: tid}); fetchPositions(); fetchBalances();
                        } catch(e) { toast.error("Fail", {id: tid}); } finally { setLoading(false); }
                      }} 
                      className="bg-red-500/10 py-3.5 rounded-2xl text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all font-black text-[10px] flex items-center justify-center gap-2"
                    >
                        <Trash2 size={14}/> REMOVE
                    </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0f172a] w-full max-w-sm rounded-[48px] p-8 border border-slate-800 shadow-3xl">
            <div className="flex justify-between items-center mb-8 px-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Select Asset</span>
              <button onClick={() => setIsModalOpen(false)} className="bg-slate-800 p-2.5 rounded-2xl text-slate-400 hover:text-white transition-all"><X size={18} /></button>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
              {FULL_TOKEN_LIST.map(t => (
                <div key={t.address} onClick={() => { if(modalType==='in') setTokenIn(t); else setTokenOut(t); setIsModalOpen(false); setAmount(''); setAmountOutManual(''); }} 
                  className="flex items-center justify-between p-5 hover:bg-indigo-600/10 rounded-[32px] cursor-pointer group border border-transparent hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center gap-5">
                    <LogoIcon t={t} />
                    <div>
                      <div className="font-black text-slate-200 text-md tracking-tight uppercase">{t.symbol}</div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{t.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-300">
                        {balances[t.address] ? parseFloat(balances[t.address]).toLocaleString(undefined, {maximumFractionDigits: 4}) : "0.00"}
                    </div>
                    <div className="text-[8px] text-slate-600 font-bold uppercase">BALANCE</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}