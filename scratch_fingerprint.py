import re

with open('src/app/components/BiasFingerprint.tsx', 'r') as f:
    content = f.read()

replacements = [
    # Main modal background
    (r'bg-white rounded-2xl shadow-2xl border border-border', 'bg-black/60 backdrop-blur-3xl rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10'),
    
    # Backdrop
    (r'bg-black/60 backdrop-blur-sm', 'bg-black/80 backdrop-blur-md'),
    
    # General Text Colors
    (r'text-foreground/70', 'text-white/70'),
    (r'text-foreground/60', 'text-white/60'),
    (r'text-foreground/55', 'text-white/50'),
    (r'text-foreground/50', 'text-white/50'),
    (r'text-foreground/40', 'text-white/40'),
    (r'text-foreground', 'text-white'),
    
    # Backgrounds and borders
    (r'border-border', 'border-white/10'),
    (r'bg-surface/50', 'bg-white/[0.03]'),
    (r'bg-surface/30', 'bg-white/[0.02]'),
    (r'bg-surface', 'bg-white/[0.03]'),
    (r'bg-gray-100', 'bg-white/10'),
    (r'bg-gray-200', 'bg-white/10'),
    
    # Header icons / buttons
    (r'bg-foreground text-white', 'bg-white text-black'),
    (r'hover:bg-foreground/90', 'hover:bg-white/90'),
    
    # Radar Chart Colors
    (r'#E2E8F0', '#ffffff1a'),
    (r'#64748B', '#ffffff66'),
    (r'#94A3B8', '#ffffff4d'),
    (r'background: "white"', 'background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)"'),
    
    # Progress bars / risk badges text 
    # Current risk text: text-emerald-700, text-amber-700, text-red-700 -> we want them to look good on dark
    (r'text-emerald-700', 'text-emerald-400'),
    (r'text-amber-700', 'text-gold'),
    (r'text-orange-700', 'text-orange-400'),
    (r'text-red-700', 'text-red-400'),
    
    # Backgrounds for badges
    (r'bg-emerald-100', 'bg-emerald-500/10'),
    (r'bg-amber-100', 'bg-gold/10'),
    (r'bg-orange-100', 'bg-orange-500/10'),
    (r'bg-red-100', 'bg-red-500/10'),
    
    # Borders for badges
    (r'border-emerald-300', 'border-emerald-500/30'),
    (r'border-amber-300', 'border-gold/30'),
    (r'border-orange-300', 'border-orange-500/30'),
    (r'border-red-300', 'border-red-500/30'),
    
    # Progress Bar Text
    (r'text-emerald-600', 'text-emerald-400'),
    (r'text-amber-600', 'text-gold'),
    (r'text-red-600', 'text-red-400'),
    (r'text-red-400', 'text-red-400'), # Redundant but safe
]

for old, new in replacements:
    content = re.sub(old, new, content)

# Specific fixes for the buttons at the bottom
content = content.replace(
    'className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors shadow-sm"',
    'className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors shadow-sm"'
)

with open('src/app/components/BiasFingerprint.tsx', 'w') as f:
    f.write(content)
