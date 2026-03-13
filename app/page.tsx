"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { Modal, Input, Radio, Button, message, Popconfirm, Space, Divider, Tag } from "antd";
import Image from "next/image";
import { SearchOutlined, PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { getAppData, addPlayer, updatePlayerName, removePlayer, submitMatch, deleteMatchAction } from "./actions";

import volleyballIcon from "./assets/volleyball.png";
import './app.css';

// ─── ELO LOGIC ────────────────────────────────────────────────────────────────
const K_FACTOR = 32;
const calculateNewRatings = (teamA: any[], teamB: any[], scoreA: number, scoreB: number) => {
  if (!teamA.length || !teamB.length) return 0;
  const avgA = teamA.reduce((s, p) => s + (p?.elo || 1000), 0) / teamA.length;
  const avgB = teamB.reduce((s, p) => s + (p?.elo || 1000), 0) / teamB.length;
  const expectedA = 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
  const actualA = scoreA > scoreB ? 1 : 0;
  const mov = Math.log(Math.abs(scoreA - scoreB) + 1) * (2.2 / ((actualA === 1 ? avgA - avgB : avgB - avgA) * 0.001 + 2.2));
  return Math.round(K_FACTOR * mov * (actualA - expectedA));
};

const getRank = (elo: number) => {
  if (elo >= 1750) return { label: "Champion", color: "#FF3E3E" };
  if (elo >= 1400) return { label: "Diamond", color: "#00F5FF" };
  if (elo >= 1250) return { label: "Platinum", color: "#BF5AF2" };
  if (elo >= 1100) return { label: "Gold", color: "#FFD700" };
  if (elo >= 950) return { label: "Silver", color: "#A8B2C1" };
  return { label: "Bronze", color: "#CD7F32" };
};

const Pill = ({ label, color }: { label: string; color: string }) => (
  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 800, background: `${color}20`, color, border: `1px solid ${color}50` }}>{label}</span>
);

export default function EloTracker() {
  const [players, setPlayers] = useState<any>([]);
  const [matches, setMatches] = useState<any[]>([]); 
  const [tab, setTab] = useState("ranks"); 
  const [loading, setLoading] = useState(false);
  
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tempName, setTempName] = useState("");
  const [newName, setNewName] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");

  const [matchType, setMatchType] = useState(2); 
  const [teamA, setTeamA] = useState<any[]>([]);
  const [teamB, setTeamB] = useState<any[]>([]);
  const [scoreA, setScoreA] = useState<any>(undefined);
  const [scoreB, setScoreB] = useState<any>(undefined);

  const refreshData = async () => {
    const data = await getAppData();
    setPlayers(data.players);
    const formattedMatches = data.matches.map((m: any) => ({
      id: m.id,
      date: new Date(m.matchDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      teamANames: m.participants.filter((p: any) => p.team === 'A').map((p: any) => p.player.name).join('/'),
      teamBNames: m.participants.filter((p: any) => p.team === 'B').map((p: any) => p.player.name).join('/'),
      score: `${m.scoreA}-${m.scoreB}`,
      winner: m.scoreA > m.scoreB ? "Blue" : "Gold",
      type: m.matchType
    }));
    setMatches(formattedMatches);
  };

  useEffect(() => { refreshData(); }, []);

  const handleAddPlayer = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await addPlayer(newName.trim());
      setNewName("");
      refreshData();
      message.success("Player added!");
    } catch (err) { message.error("Failed to add player."); }
    finally { setLoading(false); }
  };

  const handleUpdateName = async (id: number) => {
    if (!tempName.trim()) return;
    await updatePlayerName(id, tempName.trim());
    setEditingId(null);
    refreshData();
    message.success("Name updated");
  };

  const handleDeletePlayer = async (id: number) => {
    await removePlayer(id);
    refreshData();
    message.success("Player removed");
  };

  const handleDeleteMatch = async (id: number) => {
    await deleteMatchAction(id); 
    refreshData();
    message.success("Match deleted");
  };

  const handleMatchSubmit = async () => {
    if (teamA.length === 0 || teamB.length === 0 || scoreA === undefined || scoreB === undefined) {
        message.error("Invalid match data.");
        return;
    }
    setLoading(true);

    // 1. Calculate the shift first
    const shift = calculateNewRatings(teamA, teamB, scoreA, scoreB);

    // 2. Map the players with the correct logic
    const updatedPlayersList = players.map((p: any) => {
      const isA = teamA.find((t: any) => t.id === p.id);
      const isB = teamB.find((t: any) => t.id === p.id);
      if (!isA && !isB) return null;

      const won = (isA && scoreA > scoreB) || (isB && scoreB > scoreA);
      
      // Correctly apply the shift: Team A gets +shift if they win, -shift if they lose
      const playerEloAdjustment = isA 
        ? (scoreA > scoreB ? shift : -shift) 
        : (scoreB > scoreA ? shift : -shift);

      return { 
        id: p.id, 
        elo: p.elo + playerEloAdjustment, 
        wins: won ? p.wins + 1 : p.wins, 
        losses: won ? p.losses : p.losses + 1 
      };
    }).filter(Boolean);

    // 3. PASS ALL THREE ARGUMENTS
    await submitMatch(
      { 
        scoreA, 
        scoreB, 
        type: matchType === 2 ? "Doubles" : "Triples", 
        participants: [...teamA.map(p => ({ id: p.id, team: 'A' })), ...teamB.map(p => ({ id: p.id, team: 'B' }))] 
      }, 
      updatedPlayersList, 
      shift // <--- THIS WAS MISSING IN YOUR PAGE.TSX
    );

    setTeamA([]); setTeamB([]); setScoreA(undefined); setScoreB(undefined);
    setIsMatchModalOpen(false);
    refreshData();
    setLoading(false);
    setPlayerSearch('');
  };

  const togglePlayerSelection = (p: any) => {
    // If already in Team A, remove it
    if (teamA.find((x: any) => x.id === p.id)) {
        setTeamA(teamA.filter((x: any) => x.id !== p.id));
        return;
    }
    // If already in Team B, remove it
    if (teamB.find((x: any) => x.id === p.id)) {
        setTeamB(teamB.filter((x: any) => x.id !== p.id));
        return;
    }
    // Otherwise add to first available slot
    if (teamA.length < matchType) {
        setTeamA([...teamA, p]);
    } else if (teamB.length < matchType) {
        setTeamB([...teamB, p]);
    } else {
        message.warning("Teams are full!");
    }
  };

  const removeFromTeam = (id: number, team: 'A' | 'B') => {
      if (team === 'A') setTeamA(teamA.filter(p => p.id !== id));
      else setTeamB(teamB.filter(p => p.id !== id));
  };

  // Filter out players already selected for either team
  const availablePlayers = players.filter((p: any) => 
    !teamA.some(a => a.id === p.id) && !teamB.some(b => b.id === p.id) &&
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", background: "#0D1117", color: "#E6EDF3", fontFamily: "sans-serif", minHeight: '100vh' }}>
      <style>{`
        .btn { padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .tab-btn { flex: 1; padding: 14px; background: transparent; color: #8B949E; border: none; border-bottom: 2px solid #30363D; cursor: pointer; font-weight: bold; }
        .tab-active { color: #5C7CFA; border-bottom: 2px solid #5C7CFA; }
        .card { background: #161B22; border: 1px solid #30363D; border-radius: 12px; padding: 16px; margin: 10px; }
        .dark-modal .ant-modal-content { background: #161B22; color: white; border: 1px solid #30363D; }
        .dark-modal .ant-modal-header { background: #161B22; border-bottom: 1px solid #30363D; }
        .dark-modal .ant-modal-title { color: white; }
        .dark-input { background: #0D1117 !important; border: 1px solid #30363D !important; color: white !important; }
        .player-grid { display: flex; flex-wrap: wrap; gap: 8px; max-height: 99px; overflow-y: auto; padding: 12px; background: #0D1117; border-radius: 8px; border: 1px solid #30363D; }
        .manage-item { display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #0D1117; border-radius: 8px; margin-bottom: 8px; border: 1px solid #30363D; }
        .team-selection-area { background: #161B22; padding: 12px; border-radius: 10px; border: 1px solid #30363D; margin-bottom: 15px; }
        .team-label { font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 8px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "16px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Image src={volleyballIcon} width={24} height={24} alt="Volleyball" />
          <h2 style={{ margin: 0, letterSpacing: 1, marginLeft: '-4px' }}>
              <span style={{ color: "#5C7CFA", fontWeight: 500 }}>VOLLEY</span><span style={{ color: "#339AF0", fontWeight: 400 }}>ELO</span>
          </h2>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <button className={`tab-btn ${tab === "ranks" ? "tab-active" : ""}`} onClick={() => setTab("ranks")}>RANKINGS</button>
        <button className={`tab-btn ${tab === "log" ? "tab-active" : ""}`} onClick={() => setTab("log")}>MATCH LOG</button>
      </div>

      <div>
        {tab === "ranks" ? (
          <>
            <div style={{ padding: '10px' }}>
              <Button type="primary" block onClick={() => setIsManageModalOpen(true)} style={{ height: '45px', borderRadius: '8px', background: '#5C7CFA', marginTop: '10px' }}>Manage Players</Button>
            </div>
            <div className="player-rank-list">
              {players.map((p: any, i: number) => (
                  <div key={p.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: "bold", color: "#484F58", minWidth: '25px' }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#8B949E" }}>{p.wins}-{p.losses}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: "bold", color: "white", marginRight: 2 }}>{p.elo}</div>
                      <Pill label={getRank(p.elo).label} color={getRank(p.elo).color} />
                    </div>
                  </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '10px' }}>
              <Button type="primary" block onClick={() => setIsMatchModalOpen(true)} style={{ height: '45px', borderRadius: '8px', background: '#5C7CFA', marginTop: '10px' }}>Add Match Entry</Button>
            </div>
            <div className="matches-list">
              {matches.map(m => (
                  <div key={m.id} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: "#8B949E" }}>{m.date} • {m.type}</span>
                        <Popconfirm 
                          title="Delete match?" 
                          description="This reverts player stats." 
                          onConfirm={() => handleDeleteMatch(m.id)} 
                          okText="Delete" 
                          cancelText="Cancel"
                          placement="left"
                          okButtonProps={{ style: { background: '#5C7CFA' } }}
                          cancelButtonProps={{ style: { background: 'black', borderColor: 'white', color: 'white' } }}
                        >
                          <button style={{ background: "none", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 10 }}>Delete</button>
                        </Popconfirm>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ flex: 1, fontSize: 13 }}>
                            <div style={{ color: m.winner === "Blue" ? "#5C7CFA" : "white", fontWeight: m.winner === "Blue" ? "bold" : "normal" }}>{m.teamANames}</div>
                            <div style={{ margin: '4px 0', color: '#484F58', fontSize: 10 }}>vs</div>
                            <div style={{ color: m.winner === "Gold" ? "#FFBE0B" : "white", fontWeight: m.winner === "Gold" ? "bold" : "normal" }}>{m.teamBNames}</div>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: "bold", color: "#E6EDF3" }}>{m.score}</div>
                    </div>
                  </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal 
        title="Manage Players" 
        open={isManageModalOpen} 
        footer={null} 
        onCancel={() => setIsManageModalOpen(false)} 
        className="dark-modal manage-players-modal" 
        width={450}
      >
        <div style={{ marginTop: '16px' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input autoFocus={false} placeholder="Add new player name..." value={newName} onChange={e => setNewName(e.target.value)} className="dark-input" onPressEnter={handleAddPlayer} />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddPlayer} 
              loading={loading} 
              style={{ background: '#5C7CFA', boxShadow: 'none', border: 'none' }}>
                Add
            </Button>
          </Space.Compact>
        </div>
        <Divider style={{ borderColor: '#30363D', margin: '16px 0' }} />
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {players.map((p: any) => (
            <div key={p.id} className="manage-item">
              {editingId === p.id ? (
                <Input autoFocus={false} value={tempName} onChange={e => setTempName(e.target.value)} className="dark-input" size="small" style={{ marginLeft: 8 }} />
              ) : ( <span style={{ fontWeight: 500, color: 'white', marginLeft: '16px' }}>{p.name}</span> )}
              <Space size={0}>
                {editingId === p.id ? (
                  <><Button type="text" icon={<CheckOutlined style={{ color: '#4ADE80' }} />} onClick={() => handleUpdateName(p.id)} /><Button type="text" icon={<CloseOutlined style={{ color: '#FF6B6B' }} />} onClick={() => setEditingId(null)} /></>
                ) : (
                  <><Button type="text" icon={<EditOutlined style={{ color: '#8B949E' }} />} onClick={() => { setEditingId(p.id); setTempName(p.name); }} /><Popconfirm cancelButtonProps={{ style: { borderColor: 'white', color: 'white', background: 'black' } }} title="Delete Player?" description="This action is permanent." onConfirm={() => handleDeletePlayer(p.id)} okText="Delete" cancelText="Cancel" okButtonProps={{ danger: true }} placement="left"><Button type="text" icon={<DeleteOutlined style={{ color: '#FF6B6B' }} />} /></Popconfirm></>
                )}
              </Space>
            </div>
          ))}
        </div>
      </Modal>

      {/* --- UPDATED MATCH MODAL --- */}
      <Modal 
        title="Record Match" 
        open={isMatchModalOpen} 
        onOk={handleMatchSubmit} 
        confirmLoading={loading} 
        onCancel={() => {
          setIsMatchModalOpen(false);
          setTeamA([]); 
          setTeamB([]); 
          setScoreA(undefined); 
          setScoreB(undefined);
          setMatchType(2);
          setPlayerSearch('');
        }} 
        className="dark-modal" 
        width={400}
        okText="Record Match"
        okButtonProps={{ style: { background: '#5C7CFA' } }}
        cancelButtonProps={{ style: { background: '#0D1117', borderColor: 'white', color: 'white' } }}
      >
        <Radio.Group 
          value={matchType} 
          onChange={e => { setMatchType(e.target.value); setTeamA([]); setTeamB([]); }} 
          style={{ marginBottom: 15 }} 
          optionType="button"
          className="add-match-radio-group"
        >
            <Radio value={2}>Doubles</Radio>
            <Radio value={3}>Triples</Radio>
        </Radio.Group>

        {/* Team Blue Section */}
        <div className="team-selection-area" style={{ borderColor: '#5C7CFA30' }}>
            <div className="team-label" style={{ color: '#5C7CFA' }}>TEAM BLUE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {teamA.map(p => (
                    <Tag 
                      key={p.id} 
                      onClick={() => removeFromTeam(p.id, 'A')}
                      style={{ 
                          borderRadius: 6, 
                          fontWeight: 600,
                          background: "#5C7CFA",
                          color: "white"
                      }}>
                        {p.name}
                    </Tag>
                ))}
            </div>
            <Input autoFocus={false} type="number" placeholder="Blue Score" value={scoreA} onChange={e => setScoreA(parseInt(e.target.value))} className="dark-input" />
        </div>

        {/* Team Gold Section */}
        <div className="team-selection-area" style={{ borderColor: '#FFBE0B30' }}>
            <div className="team-label" style={{ color: '#FFBE0B' }}>TEAM GOLD</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {teamB.map(p => (
                    <Tag 
                      key={p.id} 
                      onClick={() => removeFromTeam(p.id, 'B')}
                      style={{ 
                        borderRadius: 6, 
                        fontWeight: 600, 
                        color: 'white',
                        background: "#FFBE0B",
                      }}
                    >
                        {p.name}
                    </Tag>
                ))}
            </div>
            <Input autoFocus={false} type="number" placeholder="Gold Score" value={scoreB} onChange={e => setScoreB(parseInt(e.target.value))} className="dark-input" />
        </div>

        <Divider style={{ borderColor: '#30363D', margin: '15px 0', color: 'white' }}>Pick Players</Divider>
        
        <Input 
          autoFocus={false} 
          prefix={<SearchOutlined />} 
          placeholder="Search players..." 
          value={playerSearch} 
          onChange={e => setPlayerSearch(e.target.value)} 
          className="dark-input" 
          style={{ marginBottom: 10 }} 
        />
        
        <div className="player-grid">
            {availablePlayers.length > 0 ? availablePlayers.map((p: any) => (
                <button 
                  key={p.id} 
                  onClick={() => {
                    togglePlayerSelection(p);
                    setPlayerSearch('');
                  }} 
                  className="btn" style={{ background: "#21262D", color: "white", fontSize: 11, padding: '8px 12px' }}
                >
                    {p.name}
                </button>
            )) : (
                <div style={{ color: '#484F58', fontSize: 12, textAlign: 'center', width: '100%', padding: '20px' }}>No more players available</div>
            )}
        </div>
      </Modal>
    </div>
  );
}
