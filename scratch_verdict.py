import re

with open('src/app/trial/new/verdict/page.tsx', 'r') as f:
    content = f.read()

replacements = [
    # General layout & background
    (r'className="min-h-screen bg-background text-foreground"', 'className="relative min-h-screen text-white pt-16 font-sans selection:bg-white/20"'),
    (r'className="min-h-screen bg-background flex items-center justify-center"', 'className="relative min-h-screen bg-black flex items-center justify-center"'),
    (r'bg-background', 'bg-transparent'),
    (r'bg-surface/50', 'bg-white/5'),
    (r'bg-surface/30', 'bg-white/[0.02]'),
    (r'bg-surface', 'bg-black/40 backdrop-blur-2xl'),
    (r'border-border', 'border-white/10'),
    (r'bg-white\b', 'bg-black/40 backdrop-blur-2xl'), # Fix retrain panels
    
    # Text colors
    (r'text-foreground/60', 'text-white/60'),
    (r'text-foreground/50', 'text-white/50'),
    (r'text-foreground/30', 'text-white/30'),
    (r'text-foreground', 'text-white'),
    (r'text-gray-200', 'text-white/20'),
    (r'text-gray-500', 'text-white/50'),
    
    # Specific component colors
    (r'bg-red-50 border border-red-200', 'bg-white/[0.03] border border-white/10 shadow-2xl'),
    (r'bg-green-50 border border-green-200', 'bg-white/[0.03] border border-white/10 shadow-2xl'),
    (r'text-red-700', 'text-white'),
    (r'text-green-700', 'text-white'),
    (r'text-red-600', 'text-red-400'),
    (r'text-green-600', 'text-green-400'),
    (r'bg-red-100', 'bg-red-500/20'),
    (r'bg-amber-100', 'bg-gold/20'),
    (r'text-amber-700', 'text-white'),
    (r'text-amber-600', 'text-gold'),
    (r'bg-green-100', 'bg-green-500/20'),
    (r'text-blue-600', 'text-blue-400'),
    
    # Verdict Header specifics
    (r'bg-red-50\b', 'bg-red-500/10'),
    (r'border-red-200', 'border-red-500/30'),
    (r'bg-green-50\b', 'bg-green-500/10'),
    (r'border-green-200', 'border-green-500/30'),
    
    # Chart tooltips
    (r'#E2E8F0', '#ffffff1a'),
    (r'#64748B', '#ffffff99'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

# Inject the video background right after the opening div
video_bg = '''className="relative min-h-screen text-white pt-16 font-sans selection:bg-white/20">
      {/* Video Background */}
      <div className="fixed inset-0 w-full h-full z-[-2]">
        <video autoPlay loop muted playsInline className="w-full h-full object-cover scale-105">
          <source src="/scales-video.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="fixed inset-0 bg-black/60 z-[-1]" />
'''

content = content.replace('className="relative min-h-screen text-white pt-16 font-sans selection:bg-white/20">', video_bg)

# Make the metric values use elegant light font
content = re.sub(r'text-3xl font-black[^>]*>', 'text-4xl font-light tracking-tight text-white>', content)

# Fix PDF Report Bar
# The PDF bar has bg-surface, let's make it match the top bar styling of the previous page
content = content.replace(
    '<div className="border-b border-white/10 bg-black/40 backdrop-blur-2xl">',
    '<div className="border-b border-white/10 bg-white/[0.02] backdrop-blur-md">'
)

# Retrain buttons background
content = content.replace('bg-white text-gray-500', 'bg-white/5 text-white/50')
content = content.replace('bg-gray-200', 'bg-white/5')

with open('src/app/trial/new/verdict/page.tsx', 'w') as f:
    f.write(content)
