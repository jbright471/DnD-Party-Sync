import React, { useState } from 'react';
import socket from '../socket';

export default function EquipmentModal({ character, onClose }) {
    const { id, name, equipment, ac } = character;

    // Parse equipment safely
    let eqList = [];
    try {
        eqList = typeof equipment === 'string' ? JSON.parse(equipment) : (equipment || []);
    } catch (e) {
        eqList = [];
    }

    const [newItemName, setNewItemName] = useState('');
    const [newItemAC, setNewItemAC] = useState(0);

    // Calculate effective AC
    const equippedBonus = eqList
        .filter(item => item.equipped)
        .reduce((sum, item) => sum + (Number(item.acBonus) || 0), 0);
    const effectiveAC = ac + equippedBonus;

    const saveEquipment = (newList) => {
        socket.emit('update_character', {
            characterId: id,
            updates: { equipment: newList },
            actor: 'Dashboard',
        });
    };

    const handleAddItem = (e) => {
        e.preventDefault();
        if (!newItemName.trim()) return;

        const newItem = {
            id: Date.now().toString(),
            name: newItemName.trim(),
            acBonus: Number(newItemAC) || 0,
            equipped: true
        };

        saveEquipment([...eqList, newItem]);
        setNewItemName('');
        setNewItemAC(0);
    };

    const toggleEquip = (itemId) => {
        const newList = eqList.map(item =>
            item.id === itemId ? { ...item, equipped: !item.equipped } : item
        );
        saveEquipment(newList);
    };

    const deleteItem = (itemId) => {
        const newList = eqList.filter(item => item.id !== itemId);
        saveEquipment(newList);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 className="fantasy-heading" style={{ margin: 0 }}>{name}'s Equipment</h2>
                    <button className="btn-ghost" onClick={onClose}>✕</button>
                </div>

                <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: '8px', textAlign: 'center' }}>
                    <span style={{ color: 'var(--dnd-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Effective AC</span>
                    <div className="fantasy-heading" style={{ fontSize: '2rem', color: 'var(--dnd-gold)', lineHeight: 1 }}>{effectiveAC}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--dnd-muted)' }}>Base {ac} + {equippedBonus} from items</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                    {eqList.length === 0 ? (
                        <div style={{ color: 'var(--dnd-muted)', textAlign: 'center', fontStyle: 'italic', fontSize: '0.9rem' }}>Inventory is empty.</div>
                    ) : (
                        eqList.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--dnd-surface)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: item.equipped ? '#fff' : 'var(--dnd-muted)' }}>
                                        {item.name}
                                    </div>
                                    {item.acBonus > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--dnd-gold)' }}>+{item.acBonus} AC</div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className={`btn-ghost ${item.equipped ? '' : 'heal'}`}
                                        onClick={() => toggleEquip(item.id)}
                                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: item.equipped ? 'var(--dnd-gold)' : 'var(--dnd-muted)' }}
                                    >
                                        {item.equipped ? 'Unequip' : 'Equip'}
                                    </button>
                                    <button
                                        className="btn-ghost"
                                        onClick={() => deleteItem(item.id)}
                                        style={{ color: 'var(--dnd-red)', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        placeholder="Item name (e.g. Shield)"
                        className="input-field"
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <input
                        type="number"
                        placeholder="+AC"
                        className="input-field"
                        value={newItemAC || ''}
                        onChange={e => setNewItemAC(parseInt(e.target.value) || 0)}
                        style={{ width: '60px' }}
                        title="AC Bonus"
                    />
                    <button type="submit" className="btn-primary" disabled={!newItemName.trim()}>Add</button>
                </form>
            </div>
        </div>
    );
}
