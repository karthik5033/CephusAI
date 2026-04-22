import re

with open('src/app/demo/page.tsx', 'r') as f:
    content = f.read()

replacements = [
    # Top level container layout
    (r'className="h-\[calc\(100vh-65px\)\] w-full bg-background text-foreground flex flex-col overflow-hidden font-sans"',
     'className="relative h-screen w-full text-white flex flex-col overflow-hidden font-sans selection:bg-white/20 pt-16"'),

    # Backgrounds and borders
    (r'bg-surface/50', 'bg-black/40 backdrop-blur-2xl'),
    (r'bg-surface/80 backdrop-blur', 'bg-black/40 backdrop-blur-2xl'),
    (r'bg-surface', 'bg-white/[0.02]'),
    (r'bg-background', 'bg-transparent'),
    (r'border-border', 'border-white/10'),
    (r'bg-gray-100', 'bg-white/10'),

    # Text Colors
    (r'text-foreground/90', 'text-white/90'),
    (r'text-foreground/80', 'text-white/80'),
    (r'text-foreground/70', 'text-white/70'),
    (r'text-foreground/60', 'text-white/60'),
    (r'text-foreground/50', 'text-white/50'),
    (r'text-foreground/40', 'text-white/40'),
    (r'text-foreground', 'text-white'),

    # Specific bright backgrounds (Red, Green, Blue, Amber)
    (r'bg-red-50 border-b border-red-200', 'bg-white/5 border-b border-white/10'),
    (r'bg-red-50', 'bg-white/[0.03]'),
    (r'border-red-200', 'border-white/10'),
    (r'bg-red-100', 'bg-red-500/20'),
    (r'text-red-700', 'text-red-400'),
    (r'text-red-600', 'text-red-400'),
    (r'text-red-800', 'text-white'),

    (r'bg-green-50', 'bg-white/[0.03]'),
    (r'border-green-200', 'border-white/10'),
    (r'bg-green-100', 'bg-green-500/20'),
    (r'text-green-700', 'text-green-400'),
    (r'text-green-600', 'text-green-400'),

    (r'bg-blue-100', 'bg-blue-500/20'),
    (r'text-blue-600', 'text-blue-400'),
    (r'bg-blue-50', 'bg-white/10'),
    
    (r'bg-amber-100', 'bg-white/5'),
    (r'border-amber-200', 'border-white/10'),
    (r'text-amber-900', 'text-white'),
    (r'text-amber-600', 'text-gold'),
    (r'text-amber-500', 'text-gold'),
    (r'bg-amber-50', 'bg-gold/10'),

    (r'text-gray-600', 'text-white/60'),
    (r'text-gray-400', 'text-white/40'),

    # Chart formatting
    (r'#E2E8F0', '#ffffff1a'),
    (r'#64748B', '#ffffff99'),
    (r"cursor=\{\{ fill: 'rgba\(0,0,0,0\.05\)' \}\}", "cursor={{ fill: 'rgba(255,255,255,0.05)' }}"),
    
    # Hide scrollbars
    (r'overflow-y-auto', 'overflow-y-auto [&::-webkit-scrollbar]:hidden'),
    
    # Bottom Banner (What is COMPAS)
    (r'bg-background border-t border-border shrink-0', 'bg-black/60 backdrop-blur-3xl border-t border-white/10 shrink-0 z-10'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

# Inject video background after top level container
video_bg = '''className="relative h-screen w-full text-white flex flex-col overflow-hidden font-sans selection:bg-white/20 pt-16">
      
      {/* Video Background */}
      <div className="fixed inset-0 w-full h-full z-[-2]">
        <video autoPlay loop muted playsInline className="w-full h-full object-cover scale-105">
          <source src="/scales-video.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="fixed inset-0 bg-black/60 z-[-1]" />
'''
content = content.replace('className="relative h-screen w-full text-white flex flex-col overflow-hidden font-sans selection:bg-white/20 pt-16">', video_bg)

# Update getAgentStyles perfectly
old_agent_styles = """  const getAgentStyles = (role: string) => {
    switch (role) {
      case "PROSECUTION": return { color: "text-red-600", bg: "bg-red-100", border: "border-red-200", icon: Scale };
      case "DEFENSE": return { color: "text-blue-600", bg: "bg-blue-100", border: "border-blue-200", icon: Shield };
      case "JUDGE": return { color: "text-amber-600", bg: "bg-amber-100", border: "border-amber-200", icon: Gavel };
      default: return { color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-200", icon: User };
    }
  };"""

new_agent_styles = """  const getAgentStyles = (role: string) => {
    switch (role) {
      case "PROSECUTION": return { color: "text-white", bg: "bg-white/5", border: "border-white/10", icon: Scale };
      case "DEFENSE": return { color: "text-white", bg: "bg-white/5", border: "border-white/10", icon: Shield };
      case "JUDGE": return { color: "text-white", bg: "bg-white/10", border: "border-white/20", icon: Gavel };
      default: return { color: "text-white/60", bg: "transparent", border: "border-white/5", icon: User };
    }
  };"""
content = content.replace(old_agent_styles, new_agent_styles)

# Fix Trial Complete button text colors
content = content.replace(
    'className="bg-foreground text-background',
    'className="bg-white text-black'
)
content = content.replace(
    'hover:bg-foreground/90',
    'hover:bg-white/90'
)
content = content.replace(
    'bg-amber-200 hover:bg-amber-300 text-amber-900',
    'bg-white/10 hover:bg-white/20 text-white'
)
content = content.replace(
    'bg-amber-400 text-amber-900 animate-pulse ring-2 ring-amber-500',
    'bg-gold text-black animate-pulse ring-2 ring-gold'
)

with open('src/app/demo/page.tsx', 'w') as f:
    f.write(content)
