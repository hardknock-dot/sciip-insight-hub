/** TanStack Query options for every SCIIP read. Routes prefetch, components subscribe. */

import { queryOptions } from "@tanstack/react-query";
import * as api from "./api";
import type { TransactionQuery } from "@/types";

export const dataStatusQuery = queryOptions({
  queryKey: ["dataStatus"],
  queryFn: () => api.getDataStatus(),
});

export const pipelineQuery = queryOptions({
  queryKey: ["pipeline"],
  queryFn: () => api.getPipelineStatus(),
});

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: () => api.getDashboard(),
});

export const transactionsQuery = (q: TransactionQuery) =>
  queryOptions({
    queryKey: ["transactions", q],
    queryFn: () => api.getTransactions(q),
  });

export const demandLineQuery = (lineId: string) =>
  queryOptions({
    queryKey: ["demandLine", lineId],
    queryFn: () => api.getDemandLine(lineId),
  });

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () => api.getCustomers(),
});

export const customerQuery = (id: string) =>
  queryOptions({ queryKey: ["customer", id], queryFn: () => api.getCustomer(id) });

export const partsQuery = queryOptions({ queryKey: ["parts"], queryFn: () => api.getParts() });

export const partQuery = (id: string) =>
  queryOptions({ queryKey: ["part", id], queryFn: () => api.getPart(id) });

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: () => api.getProjects(),
});

export const demandAnalyticsQuery = queryOptions({
  queryKey: ["demandAnalytics"],
  queryFn: () => api.getDemandAnalytics(),
});

export const forecastQuery = (partCode: string) =>
  queryOptions({ queryKey: ["forecast", partCode], queryFn: () => api.getForecast(partCode) });

export const inventoryQuery = queryOptions({
  queryKey: ["inventory"],
  queryFn: () => api.getInventory(),
});

export const salesIntelligenceQuery = queryOptions({
  queryKey: ["salesIntelligence"],
  queryFn: () => api.getSalesIntelligence(),
});

export const managementQuery = queryOptions({
  queryKey: ["management"],
  queryFn: () => api.getManagementSummary(),
});

export const searchQuery = (term: string) =>
  queryOptions({ queryKey: ["search", term], queryFn: () => api.search(term) });
