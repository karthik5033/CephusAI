import re

with open('src/app/demo/page.tsx', 'r') as f:
    content = f.read()

replacements = [
    # Top banner button
    (r'"bg-gold text-black animate-pulse ring-2 ring-gold ring-offset-2 ring-offset-black scale-105 shadow-md"',
     '"bg-white text-black animate-pulse ring-2 ring-white ring-offset-2 ring-offset-black scale-105 shadow-md"'),
    (r'text-gold', 'text-white'),

    # Left panel icons and attributes
    (r'text-blue-400', 'text-white'),
    (r'bg-red-500/20 text-red-400', 'bg-white/10 text-white/60'),

    # Center Panel (Charge Banner)
    (r'text-red-400', 'text-white'),

    # Evidence Board (Fairness tab)
    (r'text-red-600', 'text-white'),
    (r'text-amber-600', 'text-white'),
    (r'text-red-500', 'text-white/60'),
    (r'text-amber-500', 'text-white/60'),

    # Counterfactuals
    (r'text-blue-600', 'text-white'),
    (r'bg-blue-50', 'bg-white/10'),
    (r'bg-gold/10', 'bg-white/10'),

    # Jury Panel
    (r'bg-green-500/20 text-green-400', 'bg-white/10 text-white/60'),
    (r'text-green-400', 'text-white'),
    (r'hide-scrollbar', 'hide-scrollbar [&::-webkit-scrollbar]:hidden'),

]

for old, new in replacements:
    content = content.replace(old, new)

with open('src/app/demo/page.tsx', 'w') as f:
    f.write(content)
