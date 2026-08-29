! Exact source excerpt from xTB 6.7.1 commit
! 26b28010e805f7d1aeeef39813feb473e69cc4be
! src/solv/cosmo.f90, LGPL-3.0-or-later.
!
! Upstream full-file SHA-256:
! 32b32edd43ea1eec8158192bd4676a7110bc50d55e56d36b6a2ccaf25d49aea1
! Source:
! https://github.com/grimme-lab/xtb/blob/26b28010e805f7d1aeeef39813feb473e69cc4be/src/solv/cosmo.f90

            ! Calculate surface charge per area
            zeta(ii) = self%ddCosmo%w(ig) * self%ddCosmo%ui(ig, iat) &
               & * dot_product(self%ddCosmo%basis(:, ig), self%s(:, iat))

   !! Switch convention for TM mode
   if (self%tmcosmo) zeta=-zeta