# Exact source excerpts from NIST COSMOSAC commit
# 1b82456be38026719b16cad4076109bef3fcb309
# profiles/to_sigma.py, MIT.
#
# Upstream full-file SHA-256:
# 73cd7b526568ee921e2fcd83b5d8653fccf37878fe4690abafdcd785334ace2a
# Source:
# https://github.com/usnistgov/COSMOSAC/blob/1b82456be38026719b16cad4076109bef3fcb309/profiles/to_sigma.py

# Recalculate the charge density here because the values in COSMO file are
# unnecessarily truncated.
self.sigma = np.array(self.df['charge / e']/self.df['area / A^2'])

# Atom classification excerpts.
if atom_name_i in ['N','F']:
    hydrogen_bonding_atoms.append('OT')
elif atom_name_i in ['O','H']:
    if (atom_name_i == 'H' and 'O' in atom_name_js) or (atom_name_i == 'O' and 'H' in atom_name_js):
        atom_type = 'OH'
    if atom_name_i == 'O':
        atom_type = 'OT'
    if atom_name_i == 'H' and ('F' in atom_name_js or 'N' in atom_name_js):
        atom_type = 'OT'

elif self.averaging == 'Hsieh':
    self.r_av2 = (7.25/np.pi) # [A^2]
    self.f_decay = 3.57

THEMAT = np.exp(-self.f_decay*self.dist_mat_squared/(self.rn2+self.r_av2))*self.rn2*self.r_av2/(self.rn2+self.r_av2)
return np.sum(THEMAT*sigmavals, axis=1)/np.sum(THEMAT,axis=1)

mask_OH = (
    ((self.df.atom_name == 'O') & (sigmavals > 0.0) & (self.df.hb_class == 'OH'))
    |
    ((self.df.atom_name == 'H') & (sigmavals < 0.0) & (self.df.hb_class == 'OH'))
)
mask_OT = (
    (self.df.atom_name.isin(['O', 'N', 'F']) & (sigmavals > 0.0) & (self.df.hb_class == 'OT'))
    |
    ((self.df.atom_name == 'H') & (sigmavals < 0.0) & (self.df.hb_class == 'OT'))
)

# Linear two-bin area interpolation excerpt from weightbin_sigmas.
left = int((sigma-sigmas_grid[0])/bin_width)
w_left = (sigmas_grid[left+1]-sigma)/bin_width
psigmaA[left] += area*w_left
psigmaA[left+1] += area*(1.0-w_left)

P_hb = 1 - np.exp(-sigmas**2/(2*sigma_0**2))
psigmaA_OH *= P_hb
psigmaA_OT *= P_hb
psigmaA_nhb = psigmaA_nhb + psigmaA_hb*(1-P_hb)