! Exact source excerpt from CPCM-X 1.1.0 commit
! e7f894c76d41ee1f703cf6f03e931cbcf046bc7f
! src/cpcmx/qc_calc.f90, LGPL-3.0-or-later.
!
! Upstream full-file SHA-256:
! 4b718c1c512071b07cf39e1211a756b22e20410ca430933f0e29cdd67560a46b
! Source:
! https://github.com/grimme-lab/CPCM-X/blob/e7f894c76d41ee1f703cf6f03e931cbcf046bc7f/src/cpcmx/qc_calc.f90

        Call execute_command_line(xtb_bin//" coord --gfn "//level//" --cosmo "//solvent//" --norestart &
        &> solv.out 2>error", WAIT=.true.)

        call rename('xtb.cosmo','solute.cosmo',io_error)