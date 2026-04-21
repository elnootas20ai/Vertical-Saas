import { ReactNode } from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/table';
import { Skeleton } from '../ui/skeleton';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  width?: string;
}

interface SAAS__DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (item: T) => void;
}

export function SAAS__DataTable<T extends { id: string | number }>({
  columns,
  data,
  loading = false,
  emptyState,
  onRowClick
}: SAAS__DataTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            {columns.map((column) => (
              <TableHead 
                key={column.key} 
                style={{ width: column.width }}
                className="font-semibold text-gray-900 dark:text-gray-100"
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow 
              key={item.id}
              onClick={() => onRowClick?.(item)}
              className={onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''}
            >
              {columns.map((column) => (
                <TableCell key={column.key}>
                  {column.render 
                    ? column.render(item) 
                    : (item as any)[column.key]
                  }
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
