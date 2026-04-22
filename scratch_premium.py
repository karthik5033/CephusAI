import re

with open('src/app/trial/new/page.tsx', 'r') as f:
    content = f.read()

# 1. Fix the saturated Agent styles (Prosecution, Defense, Judge, Defendant)
agent_styles_match = re.search(r'const getAgentStyles = \(role: string\) => \{.*?\};', content, re.DOTALL)
if agent_styles_match:
    new_agent_styles = """const getAgentStyles = (role: string) => {
    switch (role) {
      case "PROSECUTION": return { color: "text-white", bg: "bg-white/5", border: "border-white/10", icon: Scale };
      case "DEFENSE": return { color: "text-white", bg: "bg-white/5", border: "border-white/10", icon: Shield };
      case "JUDGE": return { color: "text-white", bg: "bg-white/10", border: "border-white/20", icon: Gavel };
      case "DEFENDANT": return { color: "text-white/60", bg: "transparent", border: "border-white/5", icon: Bot };
      default: return { color: "text-white/60", bg: "transparent", border: "border-white/5", icon: User };
    }
  };"""
    content = content.replace(agent_styles_match.group(0), new_agent_styles)

# 2. Fix scrollbars and panel backgrounds
# Add scrollbar hiding classes
content = content.replace('overflow-y-auto', 'overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]')
content = content.replace('overflow-x-auto', 'overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]')

# Fix panels to be more transparent and sleek
content = content.replace('bg-black/30 backdrop-blur-2xl', 'bg-black/40 backdrop-blur-2xl')
content = content.replace('bg-black/50 backdrop-blur-2xl', 'bg-black/40 backdrop-blur-xl')
content = content.replace('bg-black/40 backdrop-blur-xl', 'bg-black/40 backdrop-blur-2xl')

# 3. Fix the Charge Banner
old_charge = r'<div className="bg-red-500/10 border-b border-red-500/30 px-6 py-3 flex items-center justify-between shrink-0 z-10">'
new_charge = r'<div className="bg-white/5 border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 z-10 backdrop-blur-md">'
content = content.replace(old_charge, new_charge)
# If it was actually something else, let's use regex
content = re.sub(
    r'<div className="bg-red-[^"]* px-6 py-3 flex items-center justify-between shrink-0 z-10">',
    '<div className="bg-white/[0.02] border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0 z-10 backdrop-blur-md">',
    content
)

# 4. Fix Jury Cards (remove saturated backgrounds)
content = re.sub(
    r"\? \(isApproved \? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'\)",
    "? (isApproved ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.03] border-white/10')",
    content
)
# Fix Jury avatars
content = re.sub(
    r"\? \(isApproved \? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'\)",
    "? (isApproved ? 'bg-white/10 text-white' : 'bg-white/10 text-white')",
    content
)

# 5. General Cleanup of bright colors in Evidence Board
# Demographic Parity etc numbers
content = content.replace('text-red-400', 'text-white')
content = content.replace('text-amber-400', 'text-white')
content = content.replace('text-green-400', 'text-white')
content = content.replace('text-gold', 'text-white')
# We want to keep some semantic meaning but very subtle.
# Let's replace the huge colored numbers in the metrics to be white, with a subtle label
content = re.sub(r'text-3xl font-bold mb-1[^>]*>', 'text-4xl font-light tracking-tight mb-1 text-white>', content)

# 6. Chat Bubbles
# Messages Area background: 
content = content.replace('bg-surface border border-border', 'bg-white/[0.02] border border-white/5 shadow-2xl')
content = content.replace('bg-black/40 border border-white/10 p-5 rounded-2xl rounded-tl-sm shadow-sm', 'bg-white/[0.03] border border-white/10 p-6 rounded-xl shadow-2xl')
content = content.replace('border border-white/10 p-5 rounded-2xl rounded-tl-sm shadow-sm', 'border border-white/5 p-6 rounded-2xl shadow-2xl bg-black/40')

with open('src/app/trial/new/page.tsx', 'w') as f:
    f.write(content)
