import { createContext, useContext, type ReactNode } from 'react';
import type { ServiceRegistry } from './ServiceRegistry';

const ServiceRegistryContext = createContext<ServiceRegistry | null>(null);

export function ServiceRegistryProvider({
  registry,
  children,
}: {
  registry: ServiceRegistry;
  children: ReactNode;
}) {
  return <ServiceRegistryContext.Provider value={registry}>{children}</ServiceRegistryContext.Provider>;
}

/** The only way pages and components reach the services (principle III). */
export function useServiceRegistry(): ServiceRegistry {
  const registry = useContext(ServiceRegistryContext);
  if (!registry) {
    throw new Error('useServiceRegistry() must be used inside <ServiceRegistryProvider>.');
  }
  return registry;
}
