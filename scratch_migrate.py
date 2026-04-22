import re

with open('src/app/trial/new/page.tsx', 'r') as f:
    content = f.read()

# Make text replacements for dark glassmorphism
replacements = [
    (r'bg-background text-foreground', 'bg-transparent text-white'),
    (r'bg-background', 'bg-black/40 backdrop-blur-xl'),
    (r'text-foreground/(\d+)', r'text-white/\1'),
    (r'text-foreground', 'text-white'),
    (r'bg-surface/50', 'bg-black/30 backdrop-blur-2xl'),
    (r'bg-surface/80 backdrop-blur', 'bg-black/50 backdrop-blur-2xl'),
    (r'bg-surface', 'bg-black/40 backdrop-blur-xl'),
    (r'border-border', 'border-white/10'),
    (r'text-red-600', 'text-red-400'),
    (r'bg-red-100', 'bg-red-500/20'),
    (r'border-red-200', 'border-red-500/30'),
    (r'text-red-700', 'text-red-400'),
    (r'text-red-800', 'text-red-300'),
    (r'bg-red-50 ', 'bg-red-500/10 '),
    (r'bg-red-50\b', 'bg-red-500/10'),
    (r'text-blue-600', 'text-blue-400'),
    (r'bg-blue-100', 'bg-blue-500/20'),
    (r'border-blue-200', 'border-blue-500/30'),
    (r'bg-blue-50\b', 'bg-blue-500/10'),
    (r'text-amber-600', 'text-gold'),
    (r'bg-amber-100', 'bg-gold/20'),
    (r'border-amber-200', 'border-gold/30'),
    (r'bg-amber-50\b', 'bg-gold/10'),
    (r'text-green-600', 'text-green-400'),
    (r'bg-green-100', 'bg-green-500/20'),
    (r'border-green-200', 'border-green-500/30'),
    (r'bg-green-50\b', 'bg-green-500/10'),
    (r'text-gray-600', 'text-white/60'),
    (r'bg-gray-100', 'bg-white/10'),
    (r'border-gray-200', 'border-white/20'),
    (r'text-gray-400', 'text-white/40'),
    (r'bg-gray-200', 'bg-white/20'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

# Inject the video background
video_bg = '''
      {/* Video Background */}
      <div className="fixed inset-0 w-full h-full z-[-2]">
        <video autoPlay loop muted playsInline className="w-full h-full object-cover scale-105">
          <source src="/scales-video.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="fixed inset-0 bg-black/60 z-[-1]" />

      {/* MAIN CONTENT (3 COLUMNS) */}'''

content = content.replace('      {/* MAIN CONTENT (3 COLUMNS) */}', video_bg)

# Fix the main wrapper to be relative
content = content.replace('className="h-[calc(100vh-65px)] w-full bg-transparent text-white flex flex-col overflow-hidden font-sans"', 'className="relative h-[calc(100vh-65px)] w-full text-white flex flex-col overflow-hidden font-sans selection:bg-gold/30"')

with open('src/app/trial/new/page.tsx', 'w') as f:
    f.write(content)
