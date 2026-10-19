import type { DriveEstimate, DriveEstimateLine, DriveEstimateStatus } from '@/api'

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** Des centimes en euros au format français : `1247` donne « 12,47 € ». */
export const formatEuros = (cents: number): string => euros.format(cents / 100)

/** Lignes à acheter, estimées ou non (« déjà à la maison » en est exclu, comme dans la couverture du back). */
export const toBuy = (estimate: DriveEstimate): number =>
  estimate.estimatedLines + estimate.unestimatedLines

export interface GroupedLines {
  /** Les lignes à acheter sans prix sûr, hors du total : jamais devinées. */
  unestimated: DriveEstimateLine[]
  estimated: DriveEstimateLine[]
  haveAtHome: DriveEstimateLine[]
}

/** Les lignes rangées par ce qu'elles font au total, dans l'ordre reçu. */
export function groupLines(lines: DriveEstimateLine[]): GroupedLines {
  const group = (keep: (status: DriveEstimateStatus) => boolean) =>
    lines.filter((line) => keep(line.status))

  return {
    unestimated: group((status) => status !== 'ESTIMATED' && status !== 'HAVE_AT_HOME'),
    estimated: group((status) => status === 'ESTIMATED'),
    haveAtHome: group((status) => status === 'HAVE_AT_HOME'),
  }
}
