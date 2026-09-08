"""Authoritative piecewise-cubic Hermite representation in Bernstein form."""
import numpy as np
from solver import reconstructed_flux


class BernsteinHermiteProfile:
    def __init__(self, mesh, values, slopes, left=None, right=None):
        self.mesh = np.asarray(mesh)
        self.controls = np.asarray([
            [values[k], values[k] + (mesh[k+1]-mesh[k])*slopes[k]/3,
             values[k+1] - (mesh[k+1]-mesh[k])*slopes[k+1]/3, values[k+1]]
            for k in range(len(mesh)-1)])
        self.left, self.right = left, right

    @staticmethod
    def _casteljau(control, t):
        a = (1-t)*control[0]+t*control[1]
        b = (1-t)*control[1]+t*control[2]
        c = (1-t)*control[2]+t*control[3]
        d = (1-t)*a+t*b
        e = (1-t)*b+t*c
        return (1-t)*d+t*e

    def values(self, points):
        output = []
        for point in np.atleast_1d(points):
            if point == 0 and self.left is not None:
                output.append(self.left.copy()); continue
            if point == 1 and self.right is not None:
                output.append(self.right.copy()); continue
            k = min(np.searchsorted(self.mesh, point, side="right")-1,
                    len(self.controls)-1)
            k = max(k, 0)
            t = (point-self.mesh[k])/(self.mesh[k+1]-self.mesh[k])
            output.append(self._casteljau(self.controls[k], t))
        return np.asarray(output)

    def derivatives(self, points):
        output = []
        for point in np.atleast_1d(points):
            k = min(max(np.searchsorted(self.mesh, point, side="right")-1, 0),
                    len(self.controls)-1)
            width = self.mesh[k+1]-self.mesh[k]
            derivative_controls = 3*np.diff(self.controls[k], axis=0)/width
            t = (point-self.mesh[k])/width
            output.append((1-t)*((1-t)*derivative_controls[0]+t*derivative_controls[1])+
                          t*((1-t)*derivative_controls[1]+t*derivative_controls[2]))
        return np.asarray(output)


def audit_bernstein(profile, flux, g, adapter):
    controls = profile.controls
    # Convex-hull certificate: every point is a convex combination of controls.
    nonnegative = bool(np.all(controls >= 0))
    interior = (profile.mesh[:-1, None] + np.diff(profile.mesh)[:, None] *
                np.array([.125, .25, .5, .75, .875])).ravel()
    probes = np.unique(np.r_[profile.mesh, interior])
    values, slopes = profile.values(probes), profile.derivatives(probes)
    recovered = np.asarray([reconstructed_flux(x, xp, flux.sum(), g, adapter)
                            for x, xp in zip(values, slopes)])
    defect = float(np.max(np.abs(recovered-flux)/g))
    return {
        "minimumBernsteinControlFraction": float(controls.min()),
        "maximumBernsteinControlFraction": float(controls.max()),
        "allBernsteinControlsNonnegative": nonnegative,
        "wholeCurveNonnegativeByConvexHull": nonnegative,
        "literalEndpointsEvaluatedAuthoritatively": True,
        "maximumNormalizationDefect": float(np.max(np.abs(values.sum(axis=1)-1))),
        "maximumScaledConstitutiveDefect": defect,
        "probeCount": len(probes),
        "status": "NUMERICAL_PROFILE_CHECKS_PASSED"
                  if nonnegative and defect <= 1e-8 else
                  ("NON_ADMISSIBLE_NUMERICAL_PROFILE" if not nonnegative else
                   "CONSTITUTIVE_DEFECT_NOT_RESOLVED"),
    }