import { requireAuth } from "@/lib/auth-utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getIMEIRecords } from "@/app/actions/imei"
import { Plus, Search, QrCode, Smartphone } from "lucide-react"
import { IMEIStatus } from "@/types"

export default async function IMEIPage() {
  await requireAuth()
  
  const { success, imeiRecords, error } = await getIMEIRecords()

  if (!success) {
    return (
      <div className="p-6">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  const getStatusColor = (status: IMEIStatus) => {
    switch (status) {
      case IMEIStatus.IN_STOCK:
        return "bg-green-100 text-green-800"
      case IMEIStatus.SOLD:
        return "bg-blue-100 text-blue-800"
      case IMEIStatus.RETURNED:
        return "bg-yellow-100 text-yellow-800"
      case IMEIStatus.REPAIRED:
        return "bg-purple-100 text-purple-800"
      case IMEIStatus.SWAPPED:
        return "bg-orange-100 text-orange-800"
      case IMEIStatus.FAULTY:
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">IMEI Tracking</h1>
          <p className="text-gray-500">Track device IMEI numbers and lifecycle</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <QrCode className="mr-2 h-4 w-4" />
            Scan IMEI
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add IMEI
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by IMEI, serial number, or invoice..."
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IMEI Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>IMEI Records ({imeiRecords.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IMEI 1</TableHead>
                <TableHead>IMEI 2</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imeiRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    No IMEI records found
                  </TableCell>
                </TableRow>
              ) : (
                imeiRecords.map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.imei1}</TableCell>
                    <TableCell>{record.imei2 || "-"}</TableCell>
                    <TableCell>{record.serialNumber || "-"}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{record.product?.name}</div>
                        <div className="text-sm text-gray-500">{record.product?.sku}</div>
                      </div>
                    </TableCell>
                    <TableCell>{record.branch?.code}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}
                      >
                        {record.status.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell>{record.customer?.name || "-"}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="icon">
                          <Smartphone className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}