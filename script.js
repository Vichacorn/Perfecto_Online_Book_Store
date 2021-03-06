var express = require("express");
var mysql = require("mysql");
var app = express();
var path = require("path");
var fs = require("fs");
var bodyParser = require("body-parser");
var config = require("./config/config");

let current_order_num;
let order_list;

var AWS = require('aws-sdk');
var keyList = [];

const s3 = new AWS.S3({
  accessKeyId:config.dev.accessKeyID,
  secretAccessKey:config.dev.secretAccessKey,
  sessionToken: config.dev.sessionToken,
  Bucket: config.dev.aws_media_bucket
});


app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname + "./files"));

function getConnection() {
  let d = config.dev
  return mysql.createConnection({
    host: d.host,
    user: d.username,
    password: d.password, //if need, put your password here
    database: d.database
  });
}

var connection = getConnection();

app.use("/cssFiles", express.static(__dirname + "/css"));
app.use("/js", express.static(__dirname + "/js"));
app.use("/img", express.static(__dirname + "/img"));

connection.connect(function(error) {
  if (error) {
    console.log(error);
    console.log("Error");
  } else {
    console.log("Connected");
  }
});

async function updateKey(){
  console.log("Retrive data")
  const params = {
    Bucket: config.dev.aws_media_bucket,
    MaxKeys: 100
  };

  s3.listObjects(params, function (err, data) {
  if(err)throw err;
  JSON.stringify(data.Contents.forEach(e => keyList.push(e.Key.replace(".jpg","")) ));
  });
  
  keyList.forEach(async key => {
    const params = {
        Bucket: config.dev.aws_media_bucket,
        Key: key+".jpg",
        Expires: 86400
      };
  
    await s3.getSignedUrl('getObject', params, (err, url) => {
      try{
        const queryString = "UPDATE book_detail SET ImgURL= ? WHERE BookID = ?";
        getConnection().query(queryString,[url,key],(err, results) => {
        if (err) {
        console.log("failed");
        res.sendStatus(500);
        return;
      }
    });
        }catch(err){
          console.log(err);
        }
      });
        
    });
    keyList = [];
}

updateKey();

var minutes = 5, the_interval = minutes * 60 * 1000;
setInterval(async function() {
  await updateKey();
  
}, the_interval);
  


app.get("/book_detail_rows_all", function(req, res) {
  // mysql here
  connection.query(
    "SELECT distinct BookName,BookID,BookPrice FROM book_detail",
    function(error, rows, fields) {
      if (error) {
        console.log("Error in query1");
      } else {
        res.send(rows);
      }
    }
  );
});
//for admin
app.get("/book_detail_rows_checking_for_admin_1", function(req, res) {
  connection.query(
    "SELECT YEAR(DATE) as YearDate, BookName, PublisherName, sum(Quantity) as Quantity, sum(BookPrice*Quantity) as Total FROM  order_detail, book_detail, publishers WHERE order_detail.BookID = book_detail.BookID and book_detail.PublisherID = publishers.PublisherID GROUP BY YearDate,BookName, PublisherName ORDER By YearDate, Total",
    function(error, rows, fields) {
      if (error) {
        console.log("Error in query2");
        console.log(error);
      } else {
        res.send(rows);
      }
    }
  );
});

var year_checking = [2018, 2019];
year_checking.forEach(element => {
  app.get("/book_detail_rows_checking_for_admin_2_" + element, function(
    req,
    res
  ) {
    connection.query(
      "SELECT BookName, PublisherName FROM book_detail, publishers " +
        "WHERE BookName NOT IN (SELECT BookName " +
        "FROM order_detail, book_detail " +
        "WHERE order_detail.BookID = book_detail.BookID AND YEAR(DATE) = '" +
        element +
        "' " +
        "GROUP BY BookName) AND book_detail.PublisherID = publishers.PublisherID " +
        "GROUP BY BookName",
      function(error, rows, fields) {
        if (error) {
          console.log("Error in query3");
          console.log(error);
        } else {
          res.send(rows);
        }
      }
    );
  });
});
app.get("/book_detail_rows_checking_for_admin_3", function(req, res) {
  connection.query(
    "SELECT YEAR(DATE) as YearDate, Categories,  sum(Quantity) as Quantity, sum(BookPrice*Quantity) as Total" +
      " FROM order_detail, book_detail" +
      " WHERE order_detail.BookID = book_detail.BookID" +
      " GROUP BY YEAR(Date), Categories",
    function(error, rows, fields) {
      if (error) {
        console.log("Error in query4");
      } else {
        res.send(rows);
      }
    }
  );
});

var main_web = "/book_detail_rows_";
var Categories_book = [
  "'Literature and Fiction'",
  "'Health and Well-Being'",
  "'Comics and Graphic Novels'",
  "'Computers and Internet'",
  "'Military and War'",
  "'Self-Enrichment'"
];

Categories_book.forEach(element => {
  app.get(
    main_web +
      element
        .split(" ")
        .join("_")
        .split("'")
        .join(""),
    async function(req, res) {
      // mysql here
      await connection.query(
        "SELECT BookID, BookName, PenName, ISBN, BookPrice, Categories, ImgURL FROM book_detail, authors WHERE book_detail.AuthorID = authors.AuthorID and Categories = " +
          element,
        function(error, rows, fields) {
          if (error) {
            console.log("Error in query5");
          } else {
            res.send(rows);
          }
        }
      );
    });
  });

app.get("/", async function(req, res) {
  res.sendFile("index.html", { root: path.join(__dirname, "./files") });
});

app.post("/customer_order_list", function(req, res) {
  order_list = req.body.cart;
});

app.get(/^(.+)$/, function(req, res) {
  try {
    if (
      fs
        .statSync(path.join(__dirname, "./files", req.params[0] + ".html"))
        .isFile()
    ) {
      res.sendFile(req.params[0] + ".html", {
        root: path.join(__dirname, "./files")
      });
    }
  } catch (err) {
    res.sendFile("404.html", { root: path.join(__dirname, "./files") });
  }
});

app.post("/cart_fin", (req, res) => {
  console.log("posting");
  console.log("first name: " + req.body.create_first_name);

  var firstName = req.body.create_first_name;
  var lastName = req.body.create_last_name;
  var age = req.body.create_age;
  var gender = req.body.create_gender;
  var address = req.body.create_address;
  var city = req.body.create_city;
  var country = req.body.create_country;
  var zip = req.body.create_zip;
  let id;

  function appendLeadingZeroes(n) {
    if (n <= 9) {
      return "0" + n;
    }
    return n;
  }

  let current_datetime = new Date();
  let formatted_date =
    current_datetime.getFullYear() +
    "-" +
    appendLeadingZeroes(current_datetime.getMonth() + 1) +
    "-" +
    appendLeadingZeroes(current_datetime.getDate());

  const queryString =
    "INSERT INTO customers (FirstName, LastName, Age, Gender, Address, City, Country, ZipCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

  getConnection().query(
    queryString,
    [firstName, lastName, age, gender, address, city, country, zip],
    (err, results, fields) => {
      if (err) {
        console.log("failed");
        res.sendStatus(500);
        return;
      }
      id = results.insertId;
    }
  );
  // get current number

  connection.query("SELECT OrderNumber FROM order_detail", function(
    error,
    rows,
    fields
  ) {
    if (error) {
      console.log("Error in query6");
    } else {
      current_order_num = rows[rows.length - 1].OrderNumber;
    }
  });

  const queryStringOrder =
    "INSERT INTO order_detail (OrderNumber, Date, CustomerID, BookID, Quantity, Shipping_Method) VALUES (?, ?, ?, ?, ?, ?)";
  var bookID = order_list.split(";");

  setTimeout(function() {
    var quantity = 1;
    var shipping_Method = 1;
    var order_num_put = current_order_num + 1;
    bookID.forEach(element => {
      getConnection().query(
        queryStringOrder,
        [order_num_put, formatted_date, id, element, quantity, shipping_Method],
        (err, results, fields) => {
          if (err) {
            console.log("failed");
            res.sendStatus(500);
            return;
          }
        }
      );
    });
  }, 2000);
  res.redirect("/fin");
});

app.post("/cart_", (req, res) => {
  console.log("posting to order_detail");

  var orderNumber;
  var today = new Date();
  var date =
    today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
  var CustomerID;
  var bookName = "HarryPotter";
  var quantity = 3;

  const queryString =
    "INSERT INTO order_detial (OrderNumber,Date, CustomerID, BookName, Quantity) VALUES (?,?, ?, ?, ?)";
  getConnection().query(
    queryString,
    [orderNumber, date, CustomerID, bookName, quantity],
    (err, results) => {
      if (err) {
        console.log("failed");
        res.sendStatus(500);
        return;
      }
      console.log("id ----> ", results.insertedId);
    }
  );
});
// res.redirect("/index");

app.post("/put_to_cart", (req, res) => {
  console.log("posting" + req);
  console.log("isbn: " + req.body.isbn);

  res.end();
});

app.post("/add_book", (req, res) => {

  var BookID;
  var BookName;
  var AuthorID = 1;
  var ISBN = 9999;
  var BookPrice;
  var Categories;

  req.on('data', function (data) {
    var d = JSON.parse(data);
    BookID = d.BookID
    BookName = d.BookName
    Categories = d.Categories
    BookPrice = d.BookPrice

    const queryString =
    "INSERT INTO book_detail (BookID, BookName, AuthorID, ISBN, BookPrice, Categories) VALUES (?, ?, ?, ?, ?, ?)";
    getConnection().query(
    queryString,
    [BookID, BookName, AuthorID, ISBN, BookPrice, Categories],
    (err, results) => {
      if (err) {
        console.log("failed");
        res.sendStatus(500);
        return;
      }
      res.send("Add Sucess")
    }
  );
  });
  
});

app.delete("/remove_book", (req, res) => {

  var BookName

  req.on('data', function (data) {
    var d = JSON.parse(data);
    BookName = d.BookName

    const queryString =
    "DELETE FROM book_detail WHERE BookName = ?";
    getConnection().query(
    queryString,
    [BookName],
    (err, results) => {
      if (err) {
        console.log("failed");
        res.sendStatus(500);
        return;
      }
      res.send("Remove Sucess")
    }
  );
  });
  
});

app.patch("/update_price_book", (req, res) => {

  var BookName
  var BookPrice

  req.on('data', function (data) {
    var d = JSON.parse(data);
    BookName = d.BookName
    BookPrice = d.BookPrice

    const queryString =
    "UPDATE book_detail SET BookPrice= ? WHERE BookName = ?";
    if(BookPrice != null){
    getConnection().query(
    queryString,
    [BookPrice,BookName],
    (err, results) => {
      if (err) {
        console.log("failed");
        res.sendStatus(500);
        return;
      }
      res.send("Update Sucess")
    }
  );
    }else{
      res.send("failed")
    }
  });
  
});

app.patch("/update_category_book", (req, res) => {

  var BookName
  var Categories
  req.on('data', function (data) {
    var d = JSON.parse(data);
    BookName = d.BookName
    Categories = d.Categories

    const queryString =
    "UPDATE book_detail SET Categories = ? WHERE BookName = ?";
    if(Categories != null){
    getConnection().query(
    queryString,
    [Categories,BookName],
    (err, results) => {
      if (err) {
        console.log("failed");
        res.sendStatus(500);
        return;
      }
      res.send("Update Sucess")
    }
  );
    }else{
      res.send("failed")
    }
  });
  
});

app.listen(1234);
