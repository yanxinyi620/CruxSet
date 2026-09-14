// All route pickers and validators use 0°–70° in 5° steps.
export const routeAngles = Array.from({ length: 15 }, (_, index) => index * 5)
