import React from 'react';

export default function SessionEndModal({ recap, onClose }) {
    if (!recap) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-1000">
            <div className="bg-dnd-surface border border-dnd-gold/30 w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl shadow-[0_0_50px_rgba(210,160,23,0.2)] flex flex-col relative">
                {/* Decorative corners */}
                <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-dnd-gold/40 rounded-tl-xl pointer-events-none"></div>
                <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-dnd-gold/40 rounded-tr-xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-dnd-gold/40 rounded-bl-xl pointer-events-none"></div>
                <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-dnd-gold/40 rounded-br-xl pointer-events-none"></div>

                <div className="p-10 overflow-y-auto text-center">
                    <div className="text-dnd-gold text-xs font-bold uppercase tracking-[0.5em] mb-4">The Chronicles of Tonight</div>
                    <h2 className="fantasy-heading text-4xl text-white mb-8 text-shadow-gold">Adventure Concluded</h2>
                    
                    <div className="w-24 h-px bg-gradient-to-r from-transparent via-dnd-gold/50 to-transparent mx-auto mb-8"></div>

                    <div className="text-lg text-dnd-text leading-relaxed font-serif italic whitespace-pre-wrap px-4 md:px-10">
                        {recap}
                    </div>

                    <div className="mt-12">
                        <button 
                            onClick={onClose}
                            className="bg-dnd-gold/10 text-dnd-gold border border-dnd-gold/40 px-10 py-3 rounded-full font-bold uppercase tracking-[0.2em] hover:bg-dnd-gold hover:text-dnd-navy transition-all shadow-xl"
                        >
                            Return to Camp
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
