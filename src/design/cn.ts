import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Assemble des classes Tailwind sans doublon : la dernière gagne (`cn('p-2', props.class)`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
